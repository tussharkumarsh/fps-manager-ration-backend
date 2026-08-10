# fps-manager-ration-backend

Express + TypeScript API backing [fps-manager-ration](../fps-manager-ration). Owns all data access to Supabase Postgres (replacing the old Vercel Blob/.xlsx storage) — dealers' customers, transactions, month locks, and inventory ledgers.

## One-time setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — from the Supabase dashboard (Settings → API Keys). The service_role key must never be exposed to a browser.
   - `INTERNAL_API_KEY` — a random shared secret, generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. The frontend's `.env.local` must have the same value.
3. Run `supabase/schema.sql` once in the Supabase SQL Editor (Project → SQL Editor → New query) to create the tables. This can't be automated with only the API keys — it needs the SQL Editor or a direct DB password.
 
## Run

```
npm run dev     # tsx watch, port 4000 by default
npm run build && npm start   # production
```

## Architecture

- `src/routes/*` — Express routes, all gated by `internalAuth` middleware (checks `x-internal-key` header). Only `fps-manager-ration`'s own server-side API routes call this service — never a browser directly.
- `src/services/*` — business logic (auth, sync against the government ePOS portal, inventory ledger math), ported 1:1 from the old Next.js `src/server/services`.
- `src/repositories/*` — Supabase-backed data access, replacing the old Blob/xlsx repositories.
- `src/clients/GovApiClient.ts` + `src/lib/eposParser.ts` — fetches and parses transaction data from the Maharashtra ePOS government portal.

## Data model

See `supabase/schema.sql` — one table per former Excel sheet: `users`, `customers`, `transactions`, `month_locks`, `inventory_items`, `inventory_ledger`.
