import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { createAccount, newTestUser, seedJobs, signInViaApi, storedJobStatus } from "./support";

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
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "My jobs" })
      .click();
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

  test("a web address pasted into the location is refused and the form keeps what was typed", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/jobs/new");
    await expect(
      page.getByText("A place, such as a city or Remote. Put web addresses in the link field."),
    ).toBeVisible();
    await fillJob(page, {
      title: "Engineer",
      company: "Acme",
      location: "Helsinki, Finlandhttp://localhost:3001/jobs/new",
      description: "Kept text",
    });
    await page.getByRole("button", { name: "Save job" }).click();

    await expect(page.getByText(/Location should be a place.*link field/)).toBeVisible();
    await expect(page.getByLabel("Location (optional)")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Location (optional)")).toHaveValue(
      "Helsinki, Finlandhttp://localhost:3001/jobs/new",
    );
    await expect(page.getByLabel("Job description")).toHaveValue("Kept text");
    await expect(page).toHaveURL("/jobs/new");
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

test.describe("application status", () => {
  const job = { title: "Status job", company: "Acme", description: "Track me." };
  // The badge is the span right after the section heading (the <option>s share its text).
  const statusBadge = (page: Page, name: string) =>
    page.locator("#status-heading + span").filter({ hasText: new RegExp(`^${name}$`) });

  test("new jobs start as Saved, on the detail page and in the list", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await addJob(page, job);

    await expect(statusBadge(page, "Saved")).toBeVisible();
    await page.goto("/jobs");
    const card = page.locator("li", { hasText: "Status job" });
    await expect(card.getByText("Saved", { exact: true })).toBeVisible();
  });

  test("changes Saved to Applied and then Interviewing without leaving the page", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    const detail = await addJob(page, job);
    await page.goto(detail);

    await page.getByLabel("Change status").selectOption({ label: "Applied" });
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByText("Status changed to Applied.")).toBeVisible();
    await expect(statusBadge(page, "Applied")).toBeVisible();
    await expect(page).toHaveURL(detail);

    await page.getByLabel("Change status").selectOption({ label: "Interviewing" });
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByText("Status changed to Interviewing.")).toBeVisible();
    await expect(statusBadge(page, "Interviewing")).toBeVisible();
    await expect(page.getByLabel("Change status")).toHaveValue("interviewing");
    await expect(page).toHaveURL(detail);

    // The list shows it, and a reload keeps it.
    await page.goto("/jobs");
    await expect(
      page.locator("li", { hasText: "Status job" }).getByText("Interviewing", { exact: true }),
    ).toBeVisible();
    await page.goto(detail);
    await expect(statusBadge(page, "Interviewing")).toBeVisible();
  });

  test("editing a job does not reset its status", async ({ page, registeredUser, origin }) => {
    await signInViaApi(page, registeredUser, origin);
    const detail = await addJob(page, job);
    await page.goto(detail);
    await page.getByLabel("Change status").selectOption({ label: "Offered" });
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByText("Status changed to Offered.")).toBeVisible();

    await page.goto(`${detail}/edit`);
    await page.getByLabel("Job title").fill("Renamed job");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(`${detail}?updated=1`);
    await expect(statusBadge(page, "Offered")).toBeVisible();
  });

  test("filters the list by status and returns to All", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await seedJobs(registeredUser.email, [
      { title: "Alpha saved", status: "saved" },
      { title: "Beta applied", status: "applied" },
      { title: "Gamma rejected", status: "rejected" },
    ]);
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/jobs");
    const filter = page.getByRole("navigation", { name: "Filter by status" });
    await expect(filter.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
    for (const title of ["Alpha saved", "Beta applied", "Gamma rejected"]) {
      await expect(page.getByRole("link", { name: title })).toBeVisible();
    }

    await filter.getByRole("link", { name: "Applied" }).click();
    await expect(page).toHaveURL("/jobs?status=applied");
    await expect(page.getByRole("link", { name: "Beta applied" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Alpha saved" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Gamma rejected" })).toHaveCount(0);
    await expect(filter.getByRole("link", { name: "Applied" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // A status with no jobs says so and offers a way back.
    await filter.getByRole("link", { name: "Offered" }).click();
    await expect(page.getByText("No offered jobs")).toBeVisible();
    await page.getByRole("link", { name: "Show all jobs" }).click();
    await expect(page).toHaveURL("/jobs");
    await expect(page.getByRole("link", { name: "Gamma rejected" })).toBeVisible();

    // An unknown filter value is ignored, not an error.
    await page.goto("/jobs?status=hired");
    await expect(page.getByRole("link", { name: "Alpha saved" })).toBeVisible();
    await expect(filter.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
  });

  test("keeps the filter across pages and never strands the user on an empty page", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await seedJobs(registeredUser.email, [
      ...Array.from({ length: 25 }, (_, i) => ({
        title: `Applied ${i}`,
        status: "applied",
        minutesAgo: i,
      })),
      { title: "Saved only", status: "saved", minutesAgo: 100 },
    ]);
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/jobs?status=applied");
    await expect(page.getByRole("link", { name: /^Applied \d+$/ })).toHaveCount(20);

    const older = page.getByRole("link", { name: "Older" });
    await expect(older).toHaveAttribute("href", "/jobs?status=applied&page=2");
    await older.click();
    await expect(page).toHaveURL("/jobs?status=applied&page=2");
    await expect(page.getByRole("link", { name: /^Applied \d+$/ })).toHaveCount(5);
    await expect(page.getByRole("link", { name: "Newer" })).toHaveAttribute(
      "href",
      "/jobs?status=applied",
    );

    // Switching filter from page 2 starts at page 1 of the new filter.
    await page
      .getByRole("navigation", { name: "Filter by status" })
      .getByRole("link", { name: "Saved" })
      .click();
    await expect(page).toHaveURL("/jobs?status=saved");
    await expect(page.getByRole("link", { name: "Saved only" })).toBeVisible();

    // A stale page number for a smaller result set falls back to page 1.
    await page.goto("/jobs?status=saved&page=7");
    await expect(page).toHaveURL("/jobs?status=saved");
    await expect(page.getByRole("link", { name: "Saved only" })).toBeVisible();
  });

  test("a signed-out visitor is sent to sign-in and back to the filtered list", async ({
    page,
    registeredUser,
  }) => {
    await page.goto("/jobs?status=applied");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fjobs%3Fstatus%3Dapplied$/);

    await page.getByLabel("Email").fill(registeredUser.email);
    await page.getByLabel("Password").fill(registeredUser.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/jobs?status=applied");
  });

  test("another user cannot change a job's status, even with a forged job id", async ({
    page,
    registeredUser,
    request,
    origin,
    allowedConsoleErrors,
  }) => {
    // The forged request is answered with a real HTTP 404, which Chrome logs as a console error.
    allowedConsoleErrors.push("status of 404");
    await signInViaApi(page, registeredUser, origin);
    const aliceDetail = await addJob(page, { ...job, title: "Alice status job" });
    const aliceJobId = aliceDetail.split("/").pop()!;

    const bob = newTestUser();
    await createAccount(request, bob, origin);
    await page.context().clearCookies();
    await signInViaApi(page, bob, origin);
    const bobDetail = await addJob(page, { ...job, title: "Bob status job" });
    await page.goto(bobDetail);
    // Let hydration finish first, or React would restore the hidden field's original value.
    await page.waitForLoadState("networkidle");

    // Tamper with the hidden id so the form targets Alice's job.
    await page.evaluate((id) => {
      (document.querySelector("form input[name=id]") as HTMLInputElement).value = id;
    }, aliceJobId);
    await expect(page.locator("form input[name=id]")).toHaveValue(aliceJobId);
    await page.getByLabel("Change status").selectOption({ label: "Offered" });
    await page.getByRole("button", { name: "Update status" }).click();

    await expect(
      page.getByRole("heading", { name: "This page could not be found." }),
    ).toBeVisible();
    expect(await storedJobStatus(aliceJobId)).toBe("saved");

    // Bob's own job is untouched as well.
    await page.goto(bobDetail);
    await expect(statusBadge(page, "Saved")).toBeVisible();
  });

  test("works by keyboard alone", async ({ page, registeredUser, origin }) => {
    await seedJobs(registeredUser.email, [{ title: "Keyboard status", status: "saved" }]);
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/jobs");

    // Filter links are reachable and activatable with Tab and Enter.
    const applied = page
      .getByRole("navigation", { name: "Filter by status" })
      .getByRole("link", { name: "Saved" });
    await applied.focus();
    await expect(applied).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/jobs?status=saved");

    await page.getByRole("link", { name: "Keyboard status" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Application status" })).toBeVisible();
    await expect(page.getByText("Loading job…")).toBeHidden();

    // Select by typing, move to the button with Tab, submit with Enter.
    await page.getByLabel("Change status").focus();
    await page.keyboard.type("Applied");
    await expect(page.getByLabel("Change status")).toHaveValue("applied");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Update status" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Status changed to Applied.")).toBeVisible();
    await expect(statusBadge(page, "Applied")).toBeVisible();
  });

  test("fits a phone screen in both themes", async ({ page, registeredUser, origin }) => {
    await seedJobs(registeredUser.email, [
      { title: "Responsive job", status: "interviewing" },
      { title: "Other job", status: "withdrawn" },
    ]);
    await signInViaApi(page, registeredUser, origin);
    await page.setViewportSize({ width: 375, height: 812 });

    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto("/jobs");
      await expect(page.getByRole("link", { name: "Responsive job" })).toBeVisible();
      await page.getByRole("link", { name: "Responsive job" }).click();
      await expect(page.getByLabel("Change status")).toBeVisible();

      for (const path of ["/jobs", page.url()]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth, `${path} scrolls horizontally (${colorScheme})`).toBeLessThanOrEqual(
          clientWidth,
        );
      }
      for (const control of [
        page.getByLabel("Change status"),
        page.getByRole("button", { name: "Update status" }),
      ]) {
        const box = await control.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(375);
      }
    }
  });
});

test.describe("long text", () => {
  const unbroken = (char: string, length: number) => char.repeat(length);
  const LONG = {
    title: unbroken("T", 190),
    company: "International Consolidated Holdings and Industrial Software Solutions Group "
      .repeat(2)
      .trim(),
    location: unbroken("L", 190),
    url: `https://example.com/careers/${"segment-".repeat(60)}?ref=${"x".repeat(200)}`,
    description: `${unbroken("D", 480)}\n\n${"A long paragraph with ordinary words. ".repeat(40)}\n\n    indented line`,
  };

  // Streamed content first sits in a hidden container until React swaps it in, so wait for
  // toBeVisible() (not just text) before measuring; hidden elements have no layout.

  /** Fails on horizontal page scroll, on any visible element sticking out of the viewport, and on any text element that clips its own content. */
  async function expectNothingOverflowsOrClips(page: Page, label: string) {
    const problems = await page.evaluate(() => {
      const viewport = document.documentElement.clientWidth;
      const found: string[] = [];
      if (document.documentElement.scrollWidth > viewport) {
        found.push(
          `page scrolls horizontally (${document.documentElement.scrollWidth} > ${viewport})`,
        );
      }
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const where = `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`;
        if (box.right > viewport + 1 || box.left < -1)
          found.push(`${where} sticks out (right=${Math.round(box.right)})`);
        // Visually hidden helpers (skip link, screen-reader labels) clip on purpose.
        if (el.classList.contains("sr-only")) continue;
        const style = getComputedStyle(el);
        const clips = style.overflowX !== "visible" && el.scrollWidth > el.clientWidth + 1;
        const isFormControl =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          el instanceof HTMLSelectElement;
        if (clips && !isFormControl) found.push(`${where} clips its content`);
      }
      return found.slice(0, 5);
    });
    expect(problems, label).toEqual([]);
  }

  test("job cards, detail and edit pages hold long titles, companies, locations, links and descriptions", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    const detail = await addJob(page, {
      title: LONG.title,
      company: LONG.company,
      location: LONG.location,
      url: LONG.url,
      description: LONG.description,
    });

    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(viewport);
      const at = `${viewport.width}px`;

      // List: wait for the streamed card, not just the heading in the static shell.
      await page.goto("/jobs");
      await expect(page.locator("h2 a").first()).toBeVisible();
      await expect(page.locator("h2 a").first()).toHaveText(LONG.title);
      await expect(page.getByRole("main").locator("li").first()).toContainText(LONG.company);
      await expect(page.getByRole("main").locator("li").first()).toContainText(LONG.location);
      await expectNothingOverflowsOrClips(page, `/jobs at ${at}`);

      // Detail: every long value is fully present (wrapped, not truncated).
      await page.goto(detail);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(LONG.title);
      await expect(page.getByText(LONG.url, { exact: true })).toBeVisible();
      await expect(page.locator("section", { hasText: "Description" }).locator("p")).toHaveText(
        LONG.description,
      );
      await expectNothingOverflowsOrClips(page, `detail at ${at}`);

      // Edit: header text wraps and the inputs still hold the complete values.
      await page.goto(`${detail}/edit`);
      await expect(page.getByRole("heading", { level: 1, name: "Edit job" })).toBeVisible();
      await expect(page.getByLabel("Job title")).toHaveValue(LONG.title);
      await expect(page.getByLabel("Company")).toHaveValue(LONG.company);
      await expect(page.getByLabel("Location (optional)")).toHaveValue(LONG.location);
      await expect(page.getByLabel("Original posting link (optional)")).toHaveValue(LONG.url);
      await expect(page.getByLabel("Job description")).toHaveValue(LONG.description);
      await expectNothingOverflowsOrClips(page, `edit at ${at}`);
    }
  });

  test("a long server error message and long values in a failed form stay inside the page", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/jobs/new");
    await page.evaluate(() => {
      document.querySelector("form")!.noValidate = true;
    });
    await fillJob(page, {
      title: "   ",
      company: LONG.company,
      location: LONG.location,
      url: LONG.url.replace("https://", "ftp://"),
      description: LONG.description,
    });
    await page.getByRole("button", { name: "Save job" }).click();
    await expect(page.getByText("Please fix the highlighted fields.")).toBeVisible();
    await expect(page.getByLabel("Company")).toHaveValue(LONG.company);
    await expectNothingOverflowsOrClips(page, "failed form at 375px");
  });

  test("a long status or filter context does not break the list at phone width", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await seedJobs(registeredUser.email, [
      { title: LONG.title, status: "interviewing" },
      { title: LONG.company, status: "withdrawn" },
    ]);
    await signInViaApi(page, registeredUser, origin);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/jobs?status=interviewing");
    await expect(page.locator("h2 a").first()).toBeVisible();
    await expect(page.locator("h2 a").first()).toHaveText(LONG.title);
    await expectNothingOverflowsOrClips(page, "filtered list at 375px");
  });
});
