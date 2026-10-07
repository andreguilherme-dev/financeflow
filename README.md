# FinanceFlow

**Gestão financeira em uma aplicação web: receitas, despesas, cartões, parcelamentos e relatórios em um só lugar.**

[Acessar aplicação](https://financeflow-cyan.vercel.app) · [Perfil do desenvolvedor](https://github.com/11guigamartins-cloud)

## O projeto

O FinanceFlow reúne as principais rotinas de organização financeira em uma interface construída com React e TypeScript. A aplicação utiliza Supabase para autenticação e persistência e apresenta os dados em dashboards e relatórios.

## Funcionalidades

- Dashboard com indicadores e visualização das movimentações.
- Registro de receitas e transações.
- Gestão de cartões de crédito e contas bancárias.
- Acompanhamento de parcelamentos, contas e pagamentos.
- Relatórios financeiros.
- Autenticação e fluxo de aprovação de acesso de usuários.
- Leitura de comprovantes com integração opcional ao Gemini.

## Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Interface | React, TypeScript, Tailwind CSS, Lucide |
| Navegação e gráficos | React Router, Recharts |
| Dados e autenticação | Supabase / PostgreSQL |
| Desenvolvimento e hospedagem | Vite, Vercel |

## Desenvolvimento local

Com Node.js e npm instalados:

```bash
git clone https://github.com/11guigamartins-cloud/financeflow.git
cd financeflow
npm ci
```

Crie um arquivo `.env.local` na raiz com as configurações de um projeto Supabase próprio:

```dotenv
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
```

O esquema SQL está em [`supabase/schema.sql`](supabase/schema.sql). Revise e configure esse esquema em seu próprio ambiente Supabase antes de conectar a aplicação. O acesso de usuários segue o fluxo de aprovação implementado no projeto.

```bash
npm run dev
```

Para compilar e visualizar o build:

```bash
npm run build
npm run preview
```

## Estrutura

```text
src/
  components/   Componentes de interface, layout e formulários
  contexts/     Autenticação e estado financeiro
  lib/          Integrações e acesso aos dados
  pages/        Dashboard, receitas, cartões, transações e relatórios
  types/        Tipos de domínio
  utils/        Formatação e utilitários
supabase/
  schema.sql    Esquema do banco
```

## Autor

Desenvolvido por **[André Guilherme](https://github.com/11guigamartins-cloud)**.
