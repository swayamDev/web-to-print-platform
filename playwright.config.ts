import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// Test-account credentials live in .env.local (never committed).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * End-to-end tests. Every PRD testing-checklist item (p10 §16) gets a spec here.
 * Runs at a phone and a desktop viewport because the PRD requires mobile-first.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Locally one `next start` process serves every request on a single thread (plus Supabase in
  // Docker), so heavy parallelism queues requests; deployed sites scale per request.
  workers: process.env.E2E_BASE_URL ? 4 : 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  // Generous locally: Supabase Auth and Postgres run in Docker and slow down when several test
  // workers sign in at once (live runs finish the same flows in seconds).
  expect: { timeout: process.env.E2E_BASE_URL ? 15_000 : 30_000 },
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Test a production build (fast and close to what is deployed) unless a deployed URL is
  // given. A dev server already running on the port is reused instead.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm build && pnpm start",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      },
});
