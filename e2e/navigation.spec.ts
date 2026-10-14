import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { seedJobs, signInViaApi } from "./support";

const MAIN = (page: Page) => page.getByRole("navigation", { name: "Main" });

/** Signs in, seeds one job and returns its detail path. */
async function setUp(
  page: Page,
  email: string,
  origin: string,
  user: Parameters<typeof signInViaApi>[1],
) {
  await seedJobs(email, [{ title: "Navigation job", status: "saved" }]);
  await signInViaApi(page, user, origin);
  await page.goto("/jobs");
  await page.getByRole("link", { name: "Navigation job" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Navigation job" })).toBeVisible();
  return new URL(page.url()).pathname;
}

test.describe("application shell (desktop)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("shows the grouped sidebar with only real destinations", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/");
    const nav = MAIN(page);
    await expect(nav).toBeVisible();
    await expect(nav.getByText("Workspace", { exact: true })).toBeVisible();
    await expect(nav.getByText("Personal", { exact: true })).toBeVisible();
    // No career-tool or settings destinations exist yet, so none are listed.
    await expect(nav.getByText("Career tools")).toHaveCount(0);

    const links = await nav
      .getByRole("link")
      .evaluateAll((els) => els.map((el) => [el.textContent?.trim(), el.getAttribute("href")]));
    expect(links).toEqual([
      ["Home", "/"],
      ["My jobs", "/jobs"],
      ["My profile", "/profile"],
    ]);

    // Every link leads to a real page inside the shell (no dead links).
    for (const [, href] of links) {
      const response = await page.goto(href!);
      expect(response?.status(), href!).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(MAIN(page)).toBeVisible();
    }
  });

  test("marks the exact page and its parent section", async ({ page, registeredUser, origin }) => {
    const detail = await setUp(page, registeredUser.email, origin, registeredUser);
    const link = (name: string) => MAIN(page).getByRole("link", { name, exact: true });

    const cases: [string, Record<string, string | null>][] = [
      ["/", { Home: "page", "My jobs": null, "My profile": null }],
      ["/jobs", { Home: null, "My jobs": "page", "My profile": null }],
      ["/jobs/new", { Home: null, "My jobs": "true", "My profile": null }],
      [detail, { Home: null, "My jobs": "true", "My profile": null }],
      [`${detail}/edit`, { Home: null, "My jobs": "true", "My profile": null }],
      ["/profile", { Home: null, "My jobs": null, "My profile": "page" }],
    ];
    for (const [path, expected] of cases) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      for (const [name, current] of Object.entries(expected)) {
        if (current)
          await expect(link(name), `${name} on ${path}`).toHaveAttribute("aria-current", current);
        else await expect(link(name), `${name} on ${path}`).not.toHaveAttribute("aria-current");
      }
    }
  });

  test("every signed-in route renders inside the shell with one main and one h1", async ({
    page,
    registeredUser,
    origin,
  }) => {
    const detail = await setUp(page, registeredUser.email, origin, registeredUser);
    for (const path of ["/", "/jobs", "/jobs/new", detail, `${detail}/edit`, "/profile"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(MAIN(page)).toBeVisible();
      await expect(page.getByLabel("Theme")).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
      await expect(page.locator("aside").getByText(registeredUser.email)).toBeVisible();
    }
  });

  test("breadcrumbs lead back up and mark the current page", async ({
    page,
    registeredUser,
    origin,
  }) => {
    const detail = await setUp(page, registeredUser.email, origin, registeredUser);
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });

    await expect(crumbs.getByRole("link")).toHaveText(["My jobs"]);
    await expect(crumbs.locator("[aria-current=page]")).toHaveText("Navigation job");

    await page.goto(`${detail}/edit`);
    await expect(crumbs.getByRole("link")).toHaveText(["My jobs", "Navigation job"]);
    await expect(crumbs.locator("[aria-current=page]")).toHaveText("Edit");
    await crumbs.getByRole("link", { name: "Navigation job" }).click();
    await expect(page).toHaveURL(detail);
    await crumbs.getByRole("link", { name: "My jobs" }).click();
    await expect(page).toHaveURL("/jobs");

    await page.goto("/jobs/new");
    await expect(crumbs.locator("[aria-current=page]")).toHaveText("Add a job");
  });

  test("offers a skip link that moves focus to the main content", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/profile");
    await expect(page.getByLabel("Headline")).toBeVisible();
    // No click first: Tab starts from the top of the document, where the skip link is.
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
  });

  test("sidebar links work by keyboard and show a focus ring", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/");
    const jobs = MAIN(page).getByRole("link", { name: "My jobs", exact: true });
    await jobs.focus();
    await expect(jobs).toBeFocused();
    await page.waitForTimeout(300);
    const outline = await jobs.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { width: cs.outlineWidth, style: cs.outlineStyle };
    });
    expect(outline).toEqual({ width: "2px", style: "solid" });
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/jobs");
    await expect(jobs).toHaveAttribute("aria-current", "page");
  });

  test("signing out returns to sign-in and protects the app again", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/jobs");
    await expect(page.getByRole("heading", { level: 1, name: "Saved jobs" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);

    await page.goto("/jobs");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fjobs$/);
  });
});

test.describe("sign-in and sign-up stay outside the shell", () => {
  for (const path of ["/sign-in", "/sign-up"]) {
    test(`${path} has no sidebar, theme picker or account panel`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(MAIN(page)).toHaveCount(0);
      await expect(page.getByLabel("Theme")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
      await expect(page.getByRole("main")).toHaveCount(1);
    });
  }

  test("a signed-in user is still sent on from an auth page by the proxy", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/sign-in?next=%2Fprofile");
    await expect(page).toHaveURL("/profile");
    await expect(MAIN(page)).toBeVisible();
  });
});

test.describe("mobile navigation (375px)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
  });

  const noHorizontalScroll = async (page: Page, label: string) => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, label).toBeLessThanOrEqual(clientWidth);
  };

  test("hides the sidebar, opens a labelled drawer and closes it with Escape, returning focus", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/jobs");
    await expect(page.getByRole("heading", { level: 1, name: "Saved jobs" })).toBeVisible();
    await expect(MAIN(page)).toHaveCount(0); // the desktop sidebar is not rendered visibly

    const menu = page.getByRole("button", { name: "Open menu" });
    await menu.click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "My jobs", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(drawer.getByText(registeredUser.email)).toBeVisible();
    await noHorizontalScroll(page, "drawer open");

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(menu).toBeFocused();
    await noHorizontalScroll(page, "drawer closed");
  });

  test("keeps keyboard focus inside the open drawer", async ({ page, registeredUser, origin }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/profile");
    await expect(page.getByLabel("Headline")).toBeVisible();
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible();

    // A native modal dialog makes the page behind it inert: focus may leave the dialog only for the
    // browser's own UI (document.body here), never for page content such as the header or <main>.
    const focusStaysInDialogOrBrowserUi = () =>
      drawer.evaluate(
        (el) => el.contains(document.activeElement) || document.activeElement === document.body,
      );
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      expect(await focusStaysInDialogOrBrowserUi(), `Tab press ${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await focusStaysInDialogOrBrowserUi(), `Shift+Tab press ${i + 1}`).toBe(true);
    }
  });

  test("closes after choosing a destination, and by its close button and the backdrop", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/");
    const menu = page.getByRole("button", { name: "Open menu" });
    const drawer = page.getByRole("dialog", { name: "Menu" });

    await menu.click();
    await drawer.getByRole("link", { name: "My profile", exact: true }).click();
    await expect(page).toHaveURL("/profile");
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "Your profile" })).toBeVisible();

    await menu.click();
    await drawer.getByRole("button", { name: "Close menu" }).click();
    await expect(drawer).toBeHidden();

    await menu.click();
    await expect(drawer).toBeVisible();
    await page.mouse.click(360, 400); // on the backdrop, right of the 288px drawer
    await expect(drawer).toBeHidden();
  });

  test("every signed-in route fits the screen, with the menu in the header", async ({
    page,
    registeredUser,
    origin,
  }) => {
    const detail = await setUp(page, registeredUser.email, origin, registeredUser);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      for (const path of ["/", "/jobs", "/jobs/new", detail, `${detail}/edit`, "/profile"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
        await expect(page.getByLabel("Theme")).toBeVisible();
        await noHorizontalScroll(page, `${path} (${colorScheme})`);
      }
    }
    // Existing screens still work behind the new layout: status filter and edit form.
    await page.goto("/jobs?status=saved");
    await expect(page.getByRole("link", { name: "Navigation job" })).toBeVisible();
    await page.goto(`${detail}/edit`);
    await expect(page.getByLabel("Job title")).toHaveValue("Navigation job");
  });
});

test.describe("theme picker", () => {
  const background = (page: Page) =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const LIGHT = "rgb(250, 245, 239)";
  const DARK = "rgb(25, 26, 30)";

  test("forces a theme over the OS setting, remembers it across reloads, and returns to the system", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/profile");
    const picker = page.getByLabel("Theme");
    await expect(picker).toHaveValue("system");
    await expect.poll(() => background(page)).toBe(LIGHT);

    await picker.selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => background(page)).toBe(DARK);

    await page.reload();
    await expect(page.getByLabel("Theme")).toHaveValue("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => background(page)).toBe(DARK);

    await page.getByLabel("Theme").selectOption("system");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme");
    await expect.poll(() => background(page)).toBe(LIGHT);

    await page.emulateMedia({ colorScheme: "dark" });
    await page.getByLabel("Theme").selectOption("light");
    await expect.poll(() => background(page)).toBe(LIGHT);
  });

  test("applies a saved choice before first paint (no flash of the other theme)", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("jobpilot-theme", "dark"));
    await page.emulateMedia({ colorScheme: "light" });
    // The inline script runs while the document is still parsing, before any content paints.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        (window as unknown as { __themeAtDcl: string | null }).__themeAtDcl =
          document.documentElement.getAttribute("data-theme");
      });
    });
    await page.goto("/sign-in");
    expect(
      await page.evaluate(
        () => (window as unknown as { __themeAtDcl: string | null }).__themeAtDcl,
      ),
    ).toBe("dark");
  });
});
