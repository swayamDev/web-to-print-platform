import { expect, test, type Page } from "@playwright/test";

/**
 * PRD testing checklist (p10 §16): "Signup & login", plus role separation (p7 §10).
 * Needs local Supabase running and `pnpm seed:users` to have created the test accounts.
 */

const customer = {
  email: process.env.TEST_CUSTOMER_EMAIL ?? "",
  password: process.env.TEST_CUSTOMER_PASSWORD ?? "",
};
const admin = {
  email: process.env.TEST_ADMIN_EMAIL ?? "",
  password: process.env.TEST_ADMIN_PASSWORD ?? "",
};

async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test.describe("authentication", () => {
  test.beforeAll(() => {
    expect(customer.password, "TEST_CUSTOMER_PASSWORD must be set (see .env.example)").not.toBe("");
    expect(admin.password, "TEST_ADMIN_PASSWORD must be set (see .env.example)").not.toBe("");
  });

  test("a visitor can sign up, lands in their account and can log out", async ({ page }) => {
    const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Priya Shah");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-42");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { name: "Hello, Priya" })).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  });

  test("signup validates input on the server", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("A");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  });

  test("a wrong password shows a generic error", async ({ page }) => {
    await logIn(page, customer.email, "definitely-wrong");
    // Next.js has its own (empty) route-announcer alert, so match the message text.
    await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("protected pages send signed-out visitors to login and back", async ({ page }) => {
    await page.goto("/account/profile");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Fprofile/);

    await page.getByLabel("Email").fill(customer.email);
    await page.getByLabel("Password").fill(customer.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account\/profile$/);
  });

  test("a customer can update their profile", async ({ page }) => {
    await logIn(page, customer.email, customer.password);
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/account/profile");
    const company = `Test Co ${Date.now()}`;
    await page.getByLabel("Company (optional)").fill(company);
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByRole("status")).toHaveText("Your details have been saved.");

    await page.reload();
    await expect(page.getByLabel("Company (optional)")).toHaveValue(company);
  });

  test("a customer cannot open the admin area", async ({ page }) => {
    await logIn(page, customer.email, customer.password);
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);

    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Overview" })).toHaveCount(0);
  });

  test("a user can reset a forgotten password from the email link", async ({ page, request }) => {
    const email = `reset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Reset Tester");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("original-pass-1");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/$/);

    await expect(page.getByRole("link", { name: "Log in", exact: true })).toBeVisible();

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("If an account exists");

    // Local Supabase delivers auth emails to Mailpit (port from supabase/config.toml).
    const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:55324";
    let link: string | undefined;
    await expect
      .poll(
        async () => {
          const search = await request.get(`${mailpit}/api/v1/search`, {
            params: { query: `to:"${email}"` },
          });
          const { messages } = (await search.json()) as { messages: { ID: string }[] };
          const first = messages[0];
          if (!first) return undefined;
          const message = await request.get(`${mailpit}/api/v1/message/${first.ID}`);
          const { Text } = (await message.json()) as { Text: string };
          link = Text.match(/https?:\/\/\S+verify\S+/)?.[0];
          return link;
        },
        { timeout: 20_000 },
      )
      .toBeTruthy();

    await page.goto(link!);
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.getByLabel("New password", { exact: true }).fill("brand-new-pass-2");
    await page.getByLabel("Confirm new password").fill("brand-new-pass-2");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("status")).toHaveText("Your password has been updated.");

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Log in", exact: true })).toBeVisible();
    await logIn(page, email, "brand-new-pass-2");
    await expect(page).toHaveURL(/\/account$/);
  });

  test("an admin logs in to the admin overview", async ({ page }) => {
    await logIn(page, admin.email, admin.password);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
  });
});
