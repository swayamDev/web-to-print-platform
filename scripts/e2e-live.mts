/**
 * Run the end-to-end tests against the live site with the live test accounts:
 *
 *   pnpm test:e2e:live [playwright args]
 *
 * Reads TEST_* values from .env.live (never committed) and overrides the local ones that
 * playwright.config.ts loads from .env.local. Skips the tests that need local email or create
 * accounts. Dev tooling only.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const LIVE_URL = process.env.E2E_BASE_URL ?? "https://web-to-print-platform-phi.vercel.app";

if (!existsSync(".env.live")) {
  console.error("Missing .env.live with the live TEST_* account values.");
  process.exit(1);
}
const env: NodeJS.ProcessEnv = { ...process.env, E2E_BASE_URL: LIVE_URL };
for (const line of readFileSync(".env.live", "utf8").split(/\r?\n/)) {
  const match = /^(TEST_[A-Z_]+)=(.*)$/.exec(line);
  if (match) env[match[1]!] = match[2]!.replace(/^"|"$/g, "");
}

const args = process.argv.slice(2);
const result = spawnSync(
  "pnpm",
  [
    "exec",
    "playwright",
    "test",
    "--grep-invert",
    '"sign up, lands|reset a forgotten password"',
    ...args,
  ],
  { env, stdio: "inherit", shell: true },
);
process.exit(result.status ?? 1);
