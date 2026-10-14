import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import type { TestUser } from "./support";

// Signs in through the API on the page's own context, so the browser holds the session cookie.
async function signIn(page: Page, user: TestUser, origin: string) {
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email: user.email, password: user.password },
    headers: { origin },
  });
  expect(res.ok()).toBe(true);
}

test.describe("candidate profile", () => {
  test("saves a profile and shows it again after reload", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signIn(page, registeredUser, origin);
    await page.goto("/profile");
    await expect(page.getByRole("heading", { level: 1, name: "Your profile" })).toBeVisible();

    await page.getByLabel("Headline").fill("Backend engineer");
    await page.getByLabel("Summary").fill("Ten years of building reliable services.");
    await page.getByLabel("Location").fill("Helsinki");
    await page.getByLabel("Years of experience").fill("10");
    await page.getByLabel("Languages").fill("English, Nepali");
    await page.getByLabel("Remote").check();
    await page.getByLabel("Hybrid").check();
    await page.getByRole("button", { name: "Save profile" }).click();

    await expect(page.getByText("Profile saved.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Headline")).toHaveValue("Backend engineer");
    await expect(page.getByLabel("Summary")).toHaveValue(
      "Ten years of building reliable services.",
    );
    await expect(page.getByLabel("Location")).toHaveValue("Helsinki");
    await expect(page.getByLabel("Years of experience")).toHaveValue("10");
    await expect(page.getByLabel("Languages")).toHaveValue("English, Nepali");
    await expect(page.getByLabel("Remote")).toBeChecked();
    await expect(page.getByLabel("Hybrid")).toBeChecked();
    await expect(page.getByLabel("On-site")).not.toBeChecked();
  });

  test("updates an existing profile instead of creating a second one", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signIn(page, registeredUser, origin);
    await page.goto("/profile");
    await page.getByLabel("Headline").fill("First");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();

    await page.getByLabel("Headline").fill("Second");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Headline")).toHaveValue("Second");
  });

  test("rejects invalid input on the server, even when browser validation is bypassed", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signIn(page, registeredUser, origin);
    await page.goto("/profile");

    // Simulate a client that skips the browser's min/max checks.
    await page.evaluate(() => {
      const form = document.querySelector("form")!;
      form.noValidate = true;
      document.getElementById("yearsOfExperience")?.removeAttribute("max");
    });
    await page.getByLabel("Years of experience").fill("61");
    await page.getByRole("button", { name: "Save profile" }).click();

    await expect(page.getByText("Please fix the highlighted fields.")).toBeVisible();
    await expect(page.getByLabel("Years of experience")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Profile saved.")).toHaveCount(0);

    // Nothing was stored.
    await page.reload();
    await expect(page.getByLabel("Years of experience")).toHaveValue("");
  });

  test("keeps each user's profile private", async ({ page, registeredUser, request, origin }) => {
    await signIn(page, registeredUser, origin);
    await page.goto("/profile");
    await page.getByLabel("Headline").fill("Private to user A");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();

    // A second account, signed in on the same browser after user A signs out.
    const other = {
      name: "Other",
      email: `e2e-other-${Date.now()}-${Math.random().toString(16).slice(2)}@example.invalid`,
      password: "other-password-123",
    };
    await request.post("/api/auth/sign-up/email", { data: other, headers: { origin } });
    await page.context().clearCookies();
    await signIn(page, other, origin);
    await page.goto("/profile");

    await expect(page.getByRole("heading", { level: 1, name: "Your profile" })).toBeVisible();
    await expect(page.getByLabel("Headline")).toHaveValue("");
  });

  test("signed-out visitors cannot reach the profile", async ({ page }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fprofile$/);
    await expect(page.getByLabel("Headline")).toHaveCount(0);
  });
});
