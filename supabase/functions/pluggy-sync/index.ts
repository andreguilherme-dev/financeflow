import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const PLUGGY_API = 'https://api.pluggy.ai'

async function getApiKey(): Promise<string> {
  const res = await fetch(`${PLUGGY_API}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: Deno.env.get('PLUGGY_CLIENT_ID'),
      clientSecret: Deno.env.get('PLUGGY_CLIENT_SECRET'),
    }),
  })
  if (!res.ok) throw new Error(`Pluggy auth: ${res.status}`)
  const { apiKey } = await res.json()
  return apiKey
}

async function pluggyGet(path: string, apiKey: string) {
  const res = await fetch(`${PLUGGY_API}${path}`, {
    headers: { 'X-API-KEY': apiKey },
  })
  if (!res.ok) throw new Error(`Pluggy GET ${path}: ${res.status}`)
  return res.json()
}

function mapPaymentMethod(operationType: string | null): string {
  if (operationType === 'PIX') return 'pix'
  if (operationType === 'CARTAO') return 'credit'
  return 'debit'
}

function isoToDate(iso: string): string {
  // "2025-05-07T00:00:00.000Z" → "2025-05-07"
  return iso.split('T')[0]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  try {
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) throw new Error('User not found')

    const { data: profile } = await userClient
      .from('profiles').select('household_id').eq('id', user.id).single()
    if (!profile) throw new Error('Profile not found')

    const { pluggyItemId } = await req.json()
    if (!pluggyItemId) throw new Error('pluggyItemId required')

    const householdId = profile.household_id
    const apiKey = await getApiKey()

    // Fetch item + accounts from Pluggy
    const item = await pluggyGet(`/items/${pluggyItemId}`, apiKey)
    const { results: accounts } = await pluggyGet(`/accounts?itemId=${pluggyItemId}`, apiKey)

    // Sync from 3 months ago
    const fromDate = new Date()
    fromDate.setMonth(fromDate.getMonth() - 3)
    const fromStr = fromDate.toISOString().split('T')[0]

    let imported = 0
    let accountsLinked = 0

    for (const account of accounts) {
      // MVP: only BANK accounts (checking/savings). Skip CREDIT (card) accounts.
      if (account.type !== 'BANK') continue

      // ── Find or create bank_account ──────────────────────────────────────
      let bankAccountId: string | null = null

      // 1. Already linked to this Pluggy account
      const { data: linked } = await adminClient
        .from('bank_accounts')
        .select('id')
        .eq('household_id', householdId)
        .eq('pluggy_account_id', account.id)
        .maybeSingle()

      if (linked) {
        bankAccountId = linked.id
      } else {
        // 2. Match by bank name (case-insensitive contains)
        const bankSearch = (account.bankData?.transferNumber || account.name || '').split(' ')[0]
        const { data: matched } = await adminClient
          .from('bank_accounts')
          .select('id')
          .eq('household_id', householdId)
          .ilike('bank', `%${bankSearch}%`)
          .is('pluggy_account_id', null)
          .limit(1)
          .maybeSingle()

        if (matched) {
          await adminClient
            .from('bank_accounts')
            .update({ pluggy_account_id: account.id })
            .eq('id', matched.id)
          bankAccountId = matched.id
        } else {
          // 3. Create new bank_account
          const { data: created } = await adminClient
            .from('bank_accounts')
            .insert({
              household_id: householdId,
              user_id: user.id,
              name: account.name,
              bank: account.institution?.name ?? account.name,
              type: 'checking',
              balance: account.balance ?? 0,
              color: '#0ea5e9',
              pluggy_account_id: account.id,
            })
            .select('id').single()
          bankAccountId = created?.id ?? null
        }
      }

      if (!bankAccountId) continue
      accountsLinked++

      // Update bank balance
      await adminClient
        .from('bank_accounts')
        .update({ balance: account.balance ?? 0 })
        .eq('id', bankAccountId)

      // ── Fetch + import transactions (paginated, last 3 months) ────────────
      let page = 1
      let totalPages = 1

      do {
        const txData = await pluggyGet(
          `/transactions?accountId=${account.id}&from=${fromStr}&pageSize=500&page=${page}`,
          apiKey
        )
        totalPages = txData.totalPages ?? 1

        const rows = (txData.results ?? [])
          .filter((t: any) => t.type === 'DEBIT' && t.status === 'POSTED')
          .map((t: any) => ({
            household_id: householdId,
            user_id: user.id,
            bank_account_id: bankAccountId,
            card_id: null,
            payment_method: mapPaymentMethod(t.operationType ?? null),
            description: t.description,
            amount: Math.abs(Number(t.amount)),
            date: isoToDate(t.date),
            category: 'other',
            is_recurring: false,
            note: null,
            pluggy_transaction_id: t.id,
          }))

        if (rows.length > 0) {
          const { error } = await adminClient
            .from('transactions')
            .upsert(rows, { onConflict: 'pluggy_transaction_id', ignoreDuplicates: true })
          if (error) console.error('upsert error:', error.message)
          else imported += rows.length
        }

        page++
      } while (page <= totalPages)
    }

    // Upsert pluggy_items record
    await adminClient.from('pluggy_items').upsert(
      {
        household_id: householdId,
        user_id: user.id,
        pluggy_item_id: pluggyItemId,
        connector_name: item.connector?.name ?? item.institution?.name ?? 'Banco',
        status: item.status ?? 'UPDATED',
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'pluggy_item_id' }
    )

    return new Response(
      JSON.stringify({ imported, accountsLinked }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[pluggy-sync]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
