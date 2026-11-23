# src/server

Server-only code: Supabase service-role client, auth guards (`requireUser`, `requireAdmin`),
pricing/order/proof services, print-file renderers, CSV merge, uploads, payments, email.

Every file here starts with `import "server-only";` so it can never be bundled into the
browser. The Supabase service-role key may only be read inside this folder.
