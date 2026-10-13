-- ════════════════════════════════════════════════════════════════════════
-- Pluggy Open Finance integration
-- Run in Supabase → SQL Editor
-- ════════════════════════════════════════════════════════════════════════

-- 1. Link bank_accounts to Pluggy accounts
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS pluggy_account_id TEXT;

-- 2. Track which transactions came from Pluggy (deduplication)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pluggy_transaction_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_pluggy_id_idx
  ON transactions (pluggy_transaction_id)
  WHERE pluggy_transaction_id IS NOT NULL;

-- 3. Table for connected Pluggy items (one per bank connection)
CREATE TABLE IF NOT EXISTS pluggy_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pluggy_item_id TEXT NOT NULL UNIQUE,
  connector_name TEXT,
  status TEXT DEFAULT 'UPDATING',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pluggy_items_household_idx ON pluggy_items (household_id);

-- 4. RLS for pluggy_items (same pattern as other tables)
ALTER TABLE pluggy_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household isolation pluggy_items"
  ON pluggy_items
  USING (household_id = current_household_id())
  WITH CHECK (household_id = current_household_id());
