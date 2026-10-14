import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { createAccount, newTestUser, signInViaApi } from "./support";

// Next keeps previously visited routes mounted but hidden (Cache Components), so assertions about
// what the user sees must only consider visible elements after a client-side navigation.
const DESCRIPTION = "About the role.\n\nYou will:\n  - build services\n  - <b>not bold</b>";

async function fillJob(
  page: Page,
  job: { title: string; company: string; description: string; location?: string; url?: string },
) {
  await page.getByLabel("Job title").fill(job.title);
  await page.getByLabel("Company").fill(job.company);
  if (job.location) await page.getByLabel("Location (optional)").fill(job.location);
  if (job.url) await page.getByLabel("Original posting link (optional)").fill(job.url);
  await page.getByLabel("Job description").fill(job.description);
}

test.describe("job intake", () => {
  test("adds a job, then finds it in the list and on its detail page", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/jobs");
    await expect(page.getByRole("heading", { level: 1, name: "Saved jobs" })).toBeVisible();
    await expect(page.getByText("No saved jobs yet")).toBeVisible();

    await page.getByRole("link", { name: "Add your first job" }).click();
    await expect(page).toHaveURL("/jobs/new");
    await fillJob(page, {
      title: "Staff platform engineer",
      company: "Acme Oy",
      location: "Helsinki",
      url: "https://example.com/careers/42",
      description: DESCRIPTION,
    });
    await page.getByRole("button", { name: "Save job" }).click();

    // Detail page with the success message.
    await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}\?saved=1$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Staff platform engineer" }),
    ).toBeVisible();
    await expect(page.getByText("Job saved.")).toBeVisible();
    await expect(page.getByText("Acme Oy · Helsinki")).toBeVisible();
    // The description is kept as written and shown as text, never as HTML.
    const body = page.locator("section", { hasText: "Description" }).locator("p");
    await expect(body).toHaveText(DESCRIPTION);
    await expect(body.locator("b")).toHaveCount(0);
    const link = page.getByRole("link", { name: "https://example.com/careers/42" });
    await expect(link).toHaveAttribute("href", "https://example.com/careers/42");
    await expect(link).toHaveAttribute("rel", /noopener/);

    // List page.
    await page.getByRole("link", { name: "All jobs" }).click();
    await expect(page).toHaveURL("/jobs");
    await expect(page.getByRole("link", { name: "Staff platform engineer" })).toBeVisible();
    await expect(
      page.getByText("Acme Oy", { exact: true }).filter({ visible: true }),
    ).toBeVisible();

    // Back to the detail page from the list; the saved banner is gone.
    await page.getByRole("link", { name: "Staff platform engineer" }).click();
    await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Job saved.").filter({ visible: true })).toHaveCount(0);
    await expect(page.locator("section", { hasText: "Description" }).locator("p")).toHaveText(
      DESCRIPTION,
    );
  });

  test("shows server-side validation errors and keeps what was typed", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/jobs/new");
    // Skip the browser's own checks so the server's validation is what answers.
    await page.evaluate(() => {
      const form = document.querySelector("form")!;
      form.noValidate = true;
    });
    await fillJob(page, {
      title: "   ",
      company: "Acme",
      url: "javascript:alert(1)",
      description: "Kept text",
    });
    await page.getByRole("button", { name: "Save job" }).click();

    await expect(page.getByText("Please fix the highlighted fields.")).toBeVisible();
    await expect(page.getByText("Title is required.")).toBeVisible();
    await expect(page.getByText(/link starting with http/i)).toBeVisible();
    await expect(page.getByLabel("Job title")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Company")).toHaveValue("Acme");
    await expect(page.getByLabel("Job description")).toHaveValue("Kept text");
    await expect(page).toHaveURL("/jobs/new");

    // Nothing was saved.
    await page.goto("/jobs");
    await expect(page.getByText("No saved jobs yet")).toBeVisible();
  });

  test("a signed-out visitor is sent to sign-in and returned to the form", async ({
    page,
    registeredUser,
  }) => {
    await page.goto("/jobs/new");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fjobs%2Fnew$/);

    await page.getByLabel("Email").fill(registeredUser.email);
    await page.getByLabel("Password").fill(registeredUser.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/jobs/new");
    await expect(page.getByRole("heading", { level: 1, name: "Add a job" })).toBeVisible();
  });

  test("keeps one user's jobs invisible to another", async ({
    page,
    registeredUser,
    request,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/jobs/new");
    await fillJob(page, { title: "Alice only", company: "Secret Corp", description: "Private." });
    await page.getByRole("button", { name: "Save job" }).click();
    await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}\?saved=1$/);
    const privateUrl = new URL(page.url()).pathname;

    const other = newTestUser();
    await createAccount(request, other, origin);
    await page.context().clearCookies();
    await signInViaApi(page, other, origin);

    await page.goto("/jobs");
    await expect(page.getByText("No saved jobs yet")).toBeVisible();
    await expect(page.getByText("Alice only")).toHaveCount(0);

    // Someone else's job, a well-formed id that does not exist, and a malformed id must be
    // indistinguishable: same status and same page. (The status is 200, not 404: the lookup
    // runs inside a Suspense boundary, so the response has already started streaming.)
    const probes = [privateUrl, "/jobs/00000000-0000-4000-8000-000000000000", "/jobs/not-a-uuid"];
    const statuses: (number | undefined)[] = [];
    for (const url of probes) {
      const response = await page.goto(url);
      statuses.push(response?.status());
      await expect(page.getByText("This page could not be found.")).toBeVisible();
      await expect(page.getByText("Alice only")).toHaveCount(0);
      await expect(page.getByText("Secret Corp")).toHaveCount(0);
    }
    expect(new Set(statuses).size).toBe(1);
  });

  test("deletes a job after confirmation", async ({ page, registeredUser, origin }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/jobs/new");
    await fillJob(page, { title: "Short lived", company: "Acme", description: "Temporary." });
    await page.getByRole("button", { name: "Save job" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Short lived" })).toBeVisible();

    // Keyboard focus follows the control that replaces the one just activated.
    await page.getByRole("button", { name: "Delete job" }).click();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Delete job" })).toBeFocused();

    await page.getByRole("button", { name: "Delete job" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();

    await expect(page).toHaveURL("/jobs?deleted=1");
    await expect(page.getByText("Job deleted.")).toBeVisible();
    await expect(page.getByText("Short lived").filter({ visible: true })).toHaveCount(0);
  });

  test("long unbroken values stay inside the page on desktop and mobile", async ({
    page,
    registeredUser,
    origin,
  }) => {
    const unbroken = "A".repeat(190);
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/jobs/new");
    await fillJob(page, {
      title: unbroken,
      company: unbroken,
      location: unbroken,
      url: `https://example.com/${"segment-".repeat(100)}`,
      description: `${"unbrokenpath".repeat(60)}\n\n${"Long paragraph. ".repeat(200)}`,
    });
    await page.getByRole("button", { name: "Save job" }).click();
    await expect(page.getByText("Job saved.")).toBeVisible();
    const detailUrl = new URL(page.url()).pathname;

    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(viewport);
      for (const path of ["/jobs", detailUrl, "/jobs/new"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(
          scrollWidth,
          `${path} at ${viewport.width}px scrolls horizontally`,
        ).toBeLessThanOrEqual(clientWidth);
      }
    }
  });

  test("renders in both themes, including the data-theme override", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    const background = async () =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/jobs");
    await expect(page.getByText("No saved jobs yet")).toBeVisible();
    const light = await background();

    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(background).not.toBe(light);

    // A forced theme wins over the OS setting in both directions.
    await page.emulateMedia({ colorScheme: "light" });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await expect.poll(background).not.toBe(light);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await expect.poll(background).toBe(light);
  });
});
