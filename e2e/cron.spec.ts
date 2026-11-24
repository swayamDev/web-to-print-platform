import { expect, test } from "@playwright/test";

/** Keep-alive endpoint called daily by Vercel Cron (vercel.json). */
test.describe("keep-alive cron", () => {
  test.skip(({ isMobile }) => isMobile, "API test: one viewport is enough");

  test("rejects calls without the cron secret", async ({ request }) => {
    const response = await request.get("/api/cron/keepalive");
    expect(response.status()).toBe(401);

    const wrong = await request.get("/api/cron/keepalive", {
      headers: { Authorization: "Bearer not-the-secret" },
    });
    expect(wrong.status()).toBe(401);
  });

  test("touches the database with the cron secret", async ({ request }) => {
    // Live runs need the deployed secret (E2E_CRON_SECRET); the local one would not match.
    const secret = process.env.E2E_BASE_URL ? process.env.E2E_CRON_SECRET : process.env.CRON_SECRET;
    test.skip(!secret, "cron secret for this target not set");
    const response = await request.get("/api/cron/keepalive", {
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, divisions: 6 });
  });
});
