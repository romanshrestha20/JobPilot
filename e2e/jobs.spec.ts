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
});

async function addJob(
  page: Page,
  job: { title: string; company: string; description: string; location?: string; url?: string },
) {
  await page.goto("/jobs/new");
  await fillJob(page, job);
  await page.getByRole("button", { name: "Save job" }).click();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}\?saved=1$/);
  return new URL(page.url()).pathname;
}

test.describe("edit job", () => {
  const original = {
    title: "Original title",
    company: "Original Co",
    location: "Helsinki",
    url: "https://example.com/original",
    description: "Original description.",
  };

  test("opens from the detail page and shows the saved values", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    const detail = await addJob(page, original);

    await page.getByRole("link", { name: "Edit job" }).click();

    await expect(page).toHaveURL(`${detail}/edit`);
    await expect(page.getByRole("heading", { level: 1, name: "Edit job" })).toBeVisible();
    await expect(page.getByLabel("Job title")).toHaveValue(original.title);
    await expect(page.getByLabel("Company")).toHaveValue(original.company);
    await expect(page.getByLabel("Location (optional)")).toHaveValue(original.location);
    await expect(page.getByLabel("Original posting link (optional)")).toHaveValue(original.url);
    await expect(page.getByLabel("Job description")).toHaveValue(original.description);
  });

  test("saves changes and shows them on the detail page and in the list", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    const detail = await addJob(page, original);
    await page.goto(`${detail}/edit`);

    await page.getByLabel("Job title").fill("Edited title");
    await page.getByLabel("Company").fill("Edited Co");
    await page.getByLabel("Location (optional)").fill("");
    await page.getByLabel("Original posting link (optional)").fill("https://example.com/edited");
    await page
      .getByLabel("Job description")
      .fill("Edited <b>description</b>.\n\nSecond paragraph.");
    // Wait for the Server Action itself, then for the redirect to the detail page.
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(`${detail}?updated=1`);
    await expect(page.getByText("Job updated.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Edited title" })).toBeVisible();
    await expect(page.getByText("Edited Co", { exact: true })).toBeVisible();
    await expect(page.getByText("Helsinki")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "https://example.com/edited" })).toBeVisible();
    const body = page.locator("section", { hasText: "Description" }).locator("p");
    await expect(body).toHaveText("Edited <b>description</b>.\n\nSecond paragraph.");
    await expect(body.locator("b")).toHaveCount(0);

    await page.goto("/jobs");
    await expect(page.getByRole("link", { name: "Edited title" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Original title" })).toHaveCount(0);
  });

  test("shows validation errors and keeps what was typed, without changing the job", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    const detail = await addJob(page, original);
    await page.goto(`${detail}/edit`);
    await page.evaluate(() => {
      document.querySelector("form")!.noValidate = true;
    });

    await page.getByLabel("Job title").fill("   ");
    await page.getByLabel("Company").fill("Typed Co");
    await page.getByLabel("Original posting link (optional)").fill("javascript:alert(1)");
    await page.getByLabel("Job description").fill("Typed description");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Please fix the highlighted fields.")).toBeVisible();
    await expect(page.getByText("Title is required.")).toBeVisible();
    await expect(page.getByText(/link starting with http/i)).toBeVisible();
    await expect(page.getByLabel("Job title")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Company")).toHaveValue("Typed Co");
    await expect(page.getByLabel("Job description")).toHaveValue("Typed description");
    await expect(page).toHaveURL(`${detail}/edit`);

    // The saved job is untouched, and Cancel returns to it.
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(page).toHaveURL(detail);
    await expect(page.getByRole("heading", { level: 1, name: original.title })).toBeVisible();
    await expect(page.getByText(original.description)).toBeVisible();
  });

  test("another user cannot open or learn about the edit page", async ({
    page,
    registeredUser,
    request,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    const detail = await addJob(page, {
      ...original,
      title: "Alice private",
      company: "Secret Corp",
    });

    const other = newTestUser();
    await createAccount(request, other, origin);
    await page.context().clearCookies();
    await signInViaApi(page, other, origin);

    const statuses: (number | undefined)[] = [];
    for (const url of [
      `${detail}/edit`,
      "/jobs/00000000-0000-4000-8000-000000000000/edit",
      "/jobs/not-a-uuid/edit",
    ]) {
      const response = await page.goto(url);
      statuses.push(response?.status());
      await expect(page.getByText("This page could not be found.")).toBeVisible();
      await expect(page.getByText("Alice private")).toHaveCount(0);
      await expect(page.getByText("Secret Corp")).toHaveCount(0);
      await expect(page.getByLabel("Job title")).toHaveCount(0);
    }
    expect(new Set(statuses).size).toBe(1);
  });

  test("a signed-out visitor is sent to sign-in and back to the edit page", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    const detail = await addJob(page, original);
    await page.context().clearCookies();

    await page.goto(`${detail}/edit`);
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fjobs%2F[0-9a-f-]{36}%2Fedit$/);

    await page.getByLabel("Email").fill(registeredUser.email);
    await page.getByLabel("Password").fill(registeredUser.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(`${detail}/edit`);
    await expect(page.getByLabel("Job title")).toHaveValue(original.title);
  });

  test("works by keyboard alone", async ({ page, registeredUser, origin }) => {
    await signInViaApi(page, registeredUser, origin);
    const detail = await addJob(page, original);

    // Reach "Edit job" from the detail page with Tab and open it with Enter.
    await page.getByRole("link", { name: "Edit job" }).focus();
    await expect(page.getByRole("link", { name: "Edit job" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${detail}/edit`);

    // Wait for the form to be fully rendered, so focus is not lost to a late re-render.
    await expect(page.getByText("Loading job…")).toBeHidden();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();

    // Tab order follows the visual order.
    await page.getByLabel("Job title").focus();
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      order.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          return el.id || el.textContent?.trim() || el.tagName;
        }),
      );
    }
    expect(order).toEqual([
      "company",
      "location",
      "sourceUrl",
      "description",
      "Save changes",
      "Cancel",
    ]);

    // Enter in a text field submits the form.
    await page.getByLabel("Job title").focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("Typed with the keyboard");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${detail}?updated=1`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Typed with the keyboard" }),
    ).toBeVisible();

    // Cancel is a real link, reachable and activatable by keyboard.
    await page.goto(`${detail}/edit`);
    await page.getByRole("link", { name: "Cancel" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(detail);
  });

  test("fits a phone screen in both themes", async ({ page, registeredUser, origin }) => {
    await signInViaApi(page, registeredUser, origin);
    const detail = await addJob(page, {
      ...original,
      description: "A description long enough to wrap on a phone. ".repeat(40),
    });
    await page.setViewportSize({ width: 375, height: 812 });

    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto(`${detail}/edit`);
      await expect(page.getByRole("heading", { level: 1, name: "Edit job" })).toBeVisible();
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `edit page scrolls horizontally (${colorScheme})`).toBeLessThanOrEqual(
        clientWidth,
      );
      for (const control of [
        page.getByLabel("Job title"),
        page.getByLabel("Job description"),
        page.getByRole("button", { name: "Save changes" }),
        page.getByRole("link", { name: "Cancel" }),
      ]) {
        await control.scrollIntoViewIfNeeded();
        const box = await control.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(375);
      }
    }
  });
});
