-- =============================================================================
-- Explicit privileges for the server's service role.
--
-- Hosted Supabase projects can be created with "grant API access to new tables
-- automatically" turned off. Server code (secret key = service_role) must still be
-- able to read and write every table, so grant it explicitly instead of relying on
-- project defaults. service_role bypasses RLS; the app only uses it after checking
-- the caller's identity and role.
-- =============================================================================

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
