# supabase

| Path              | What it holds                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `migrations/`     | Schema, functions and triggers, row-level security and grants, storage buckets                  |
| `seed.sql`        | Settings, six divisions, materials, products, discount tiers, starter templates (sample prices) |
| `tests/database/` | pgTAP tests for access rules and the order pipeline                                             |
| `config.toml`     | Local Supabase settings (ports 553xx, email confirmation off)                                   |

Commands (from the project root, Docker running):

- `pnpm db:start` — start local Supabase
- `pnpm db:reset` — rebuild the database from migrations and seed
- `pnpm db:test` — run the database tests
- `pnpm db:types` — regenerate `src/types/db.ts`

Every new table must get explicit grants and RLS policies in its migration: default
privileges for the `anon` and `authenticated` roles are revoked.
