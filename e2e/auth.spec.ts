import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import type { TestUser } from "./support";

async function signInThroughForm(page: Page, user: TestUser) {
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("sign-up", () => {
  test("creates an account and signs the user in", async ({ page, user }) => {
    await page.goto("/sign-up");
    await expect(
      page.getByRole("heading", { level: 1, name: "Create your account" }),
    ).toBeVisible();

    await page.getByLabel("Name").fill(user.name);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "JobPilot" })).toBeVisible();

    const session = await page.request.get("/api/auth/get-session");
    expect((await session.json()).user.email).toBe(user.email);
  });

  test("does not submit a password shorter than 8 characters", async ({ page, user }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Name").fill(user.name);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/sign-up$/);
    const tooShort = await page
      .getByLabel("Password")
      .evaluate((el) => (el as HTMLInputElement).validity.tooShort);
    expect(tooShort).toBe(true);
  });

  test("shows an error when the email is already registered", async ({ page, registeredUser }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Name").fill("Someone Else");
    await page.getByLabel("Email").fill(registeredUser.email);
    await page.getByLabel("Password").fill("another-password-123");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(
      page
        .locator("[role=alert]", { hasText: /./ })
        .filter({ hasText: /exist|registered|already/i }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up$/);
  });
});

test.describe("sign-in", () => {
  test("signs a registered user in and lands on the home page", async ({
    page,
    registeredUser,
  }) => {
    await page.goto("/sign-in");
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign in to JobPilot" }),
    ).toBeVisible();
    await signInThroughForm(page, registeredUser);

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "JobPilot" })).toBeVisible();
  });

  test("shows an error for a wrong password and stays on the page", async ({
    page,
    registeredUser,
  }) => {
    await page.goto("/sign-in");
    await signInThroughForm(page, { ...registeredUser, password: "definitely-wrong-1" });

    await expect(
      page.locator("[role=alert]").filter({ hasText: /invalid|incorrect|wrong/i }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in$/);
    // The form is usable again after the failure.
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  test("a protected page sends visitors to sign-in and back after signing in", async ({
    page,
    registeredUser,
  }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fprofile$/);

    await signInThroughForm(page, registeredUser);

    await expect(page).toHaveURL("/profile");
    await expect(page.getByRole("heading", { level: 1, name: "Your profile" })).toBeVisible();
  });

  test("keeps the destination when switching between sign-in and sign-up", async ({ page }) => {
    await page.goto("/sign-in?next=%2Fprofile");
    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/sign-up\?next=%2Fprofile$/);
  });

  for (const unsafe of [
    "//evil.example",
    "https://evil.example",
    "/.//evil.example",
    "/\\evil.example",
  ]) {
    test(`ignores an unsafe next value: ${unsafe}`, async ({ page, registeredUser, baseURL }) => {
      await page.goto(`/sign-in?next=${encodeURIComponent(unsafe)}`);
      await signInThroughForm(page, registeredUser);

      await expect(page).toHaveURL("/");
      expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
    });
  }

  test("a signed-in user visiting sign-in is sent on to a safe next", async ({
    page,
    registeredUser,
  }) => {
    await page.goto("/sign-in");
    await signInThroughForm(page, registeredUser);
    await expect(page).toHaveURL("/");

    await page.goto("/sign-in?next=%2Fprofile");
    await expect(page).toHaveURL("/profile");
  });
});

test.describe("request protections (real server)", () => {
  test("rejects an auth POST from an unapproved origin", async ({ request, user }) => {
    const res = await request.post("/api/auth/sign-up/email", {
      data: user,
      headers: { origin: "https://evil.example", cookie: "better-auth.session_token=x" },
    });
    expect(res.status()).toBe(403);
  });

  test("throttles repeated sign-in attempts", async ({ request, registeredUser, origin }) => {
    const attempt = () =>
      request.post("/api/auth/sign-in/email", {
        data: { email: registeredUser.email, password: "wrong-password-1" },
        headers: { origin },
      });

    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await attempt()).status());

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });
});
