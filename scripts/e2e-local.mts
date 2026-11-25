import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

process.loadEnvFile(".env.local");
const database = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
if (
  database.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  database.port !== "55321" ||
  process.env.E2E_BASE_URL
) {
  throw new Error(
    "This runner requires the local Supabase stack and a locally managed app server.",
  );
}

const runId = randomUUID();
const port = process.env.PORT ?? "3915";
const env = {
  ...process.env,
  CI: "true",
  PORT: port,
  APP_URL: `http://localhost:${port}`,
  // Exercise signed local webhook fixtures without creating hosted Checkout sessions.
  STRIPE_SECRET_KEY: "",
  TEST_CUSTOMER_EMAIL: `customer-${runId}@test.local`,
  TEST_CUSTOMER_PASSWORD: randomBytes(24).toString("base64url"),
  TEST_ADMIN_EMAIL: `admin-${runId}@test.local`,
  TEST_ADMIN_PASSWORD: randomBytes(24).toString("base64url"),
};
const require = createRequire(import.meta.url);
for (const args of [
  ["scripts/seed-users.mts"],
  [require.resolve("@playwright/test/cli"), "test", "--retries=0", ...process.argv.slice(2)],
]) {
  const child = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
}
