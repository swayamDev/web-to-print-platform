/**
 * Create (or update) the customer and admin test accounts handed to evaluators
 * (PRD p10 §15). Safe to run repeatedly.
 *
 *   pnpm seed:users                   # uses .env.local (local Supabase)
 *   node --env-file=.env.production.local scripts/seed-users.mts   # hosted project
 *
 * Reads: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
 *        TEST_CUSTOMER_EMAIL / _PASSWORD, TEST_ADMIN_EMAIL / _PASSWORD.
 * This is developer tooling: it is the only code outside src/server that uses the secret key.
 */
import { createClient } from "@supabase/supabase-js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Add it to your env file (see .env.example).`);
    process.exit(1);
  }
  return value;
}

const supabase = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SECRET_KEY"),
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

type Account = { email: string; password: string; fullName: string; role: "customer" | "admin" };

const accounts: Account[] = [
  {
    email: required("TEST_CUSTOMER_EMAIL"),
    password: required("TEST_CUSTOMER_PASSWORD"),
    fullName: "Test Customer",
    role: "customer",
  },
  {
    email: required("TEST_ADMIN_EMAIL"),
    password: required("TEST_ADMIN_PASSWORD"),
    fullName: "Test Admin",
    role: "admin",
  },
];

async function findUserId(email: string): Promise<string | null> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function upsertAccount(account: Account) {
  let userId = await findUserId(account.email);

  if (userId) {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: account.password,
      email_confirm: true,
      user_metadata: { full_name: account.fullName },
    });
    if (error) throw error;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: { full_name: account.fullName },
    });
    if (error) throw error;
    userId = data.user.id;
  }

  // The profile row is created by a database trigger; set the role with the secret key.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ role: account.role, full_name: account.fullName })
    .eq("id", userId);
  if (profileError) throw profileError;

  console.log(`✔ ${account.role.padEnd(8)} ${account.email}`);
}

for (const account of accounts) {
  await upsertAccount(account);
}
console.log("Test accounts are ready. Passwords are in your env file.");
