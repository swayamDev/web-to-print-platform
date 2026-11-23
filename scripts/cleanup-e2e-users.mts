/**
 * Delete throwaway accounts created by end-to-end tests (emails starting with "e2e-" or
 * "reset-"), e.g. after running the signup test against the live site.
 *
 *   node --env-file=.env.production.local scripts/cleanup-e2e-users.mts
 *
 * Only users with no orders are removed (orders keep their customer for accounting).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const isTestEmail = (email?: string) =>
  !!email && /^(e2e|reset)-\d+-[a-z0-9]+@test\.local$/.test(email);

let removed = 0;
for (let page = 1; page < 50; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  for (const user of data.users.filter((u) => isTestEmail(u.email))) {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", user.id);
    if (count) continue;
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
    removed += 1;
  }
  if (data.users.length < 200) break;
}
console.log(`Removed ${removed} test account(s).`);
