import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { seedJobs, signInViaApi } from "./support";

// Canonical brand tokens (docs/DESIGN.md). Computed colours come back as rgb().
const TOKENS = {
  light: {
    background: "rgb(250, 245, 239)",
    foreground: "rgb(41, 42, 48)",
    primary: "rgb(182, 93, 69)",
  },
  dark: {
    background: "rgb(25, 26, 30)",
    foreground: "rgb(244, 237, 229)",
    primary: "rgb(212, 122, 96)",
  },
} as const;

type Scheme = keyof typeof TOKENS;
const SCHEMES: Scheme[] = ["light", "dark"];

/** Theme by OS preference ("media") or by forcing <html data-theme> against the opposite OS setting. */
async function applyTheme(page: Page, scheme: Scheme, how: "media" | "attribute") {
  const opposite: Scheme = scheme === "light" ? "dark" : "light";
  await page.emulateMedia({ colorScheme: how === "media" ? scheme : opposite });
  await page.evaluate(
    ([theme, mode]) => {
      if (mode === "attribute") document.documentElement.setAttribute("data-theme", theme);
      else document.documentElement.removeAttribute("data-theme");
    },
    [scheme, how] as const,
  );
  // Colours animate for 150ms when the theme flips; wait so every read is of the settled value.
  await page.waitForTimeout(400);
}

/** WCAG contrast of an element's text (or border) colour against its effective background. */
async function contrast(
  locator: Locator,
  source: "color" | "borderTopColor" | "outlineColor" | "placeholder" = "color",
) {
  return locator.evaluate((el, prop) => {
    const parse = (value: string) => {
      const m = value.match(/[\d.]+/g)!.map(Number);
      return value.startsWith("color(")
        ? [m[0] * 255, m[1] * 255, m[2] * 255, m[3] ?? 1]
        : [m[0], m[1], m[2], m[3] ?? 1];
    };
    const lum = ([r, g, b]: number[]) => {
      const [x, y, z] = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * x + 0.7152 * y + 0.0722 * z;
    };
    // A focus ring sits outside the element, so it is measured against the surface around it.
    let node: Element | null = prop === "outlineColor" ? el.parentElement : el;
    let background = [255, 255, 255, 1];
    while (node) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg[3] === 1) {
        background = bg;
        break;
      }
      node = node.parentElement;
    }
    const foreground = parse(
      prop === "placeholder"
        ? getComputedStyle(el, "::placeholder").color
        : getComputedStyle(el)[prop as "color"],
    );
    const [hi, lo] = [lum(foreground), lum(background)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  }, source);
}

const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const bodyColor = (page: Page) => page.evaluate(() => getComputedStyle(document.body).color);

test.describe("design tokens", () => {
  for (const scheme of SCHEMES) {
    for (const how of ["media", "attribute"] as const) {
      test(`${scheme} theme resolves to the brand palette (${how})`, async ({ page }) => {
        await page.goto("/sign-in");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await applyTheme(page, scheme, how);

        // Poll: transitions and slower engines can leave a colour mid-flight for a moment.
        await expect.poll(() => bodyBackground(page)).toBe(TOKENS[scheme].background);
        await expect.poll(() => bodyColor(page)).toBe(TOKENS[scheme].foreground);
        const signInButton = page.getByRole("button", { name: "Sign in" });
        await expect
          .poll(() => signInButton.evaluate((el) => getComputedStyle(el).backgroundColor))
          .toBe(TOKENS[scheme].primary);
        // A forced theme also themes the browser's native widgets (select popups, scrollbars).
        if (how === "attribute") {
          expect(
            await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
          ).toBe(scheme);
        }
      });
    }
  }
});

test.describe("contrast of rendered colours", () => {
  for (const scheme of SCHEMES) {
    test(`auth screen text, links, buttons, inputs and errors in ${scheme}`, async ({
      page,
      registeredUser,
    }) => {
      await page.goto("/sign-in");
      await applyTheme(page, scheme, "media");

      const heading = page.getByRole("heading", { level: 1 });
      expect(await contrast(heading), "h1").toBeGreaterThanOrEqual(4.5);
      expect(
        await contrast(page.getByText("Don't have an account?")),
        "muted footer text",
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contrast(page.getByRole("link", { name: "Sign up" })),
        "text link",
      ).toBeGreaterThanOrEqual(4.5);
      expect(await contrast(page.getByLabel("Email")), "input text").toBeGreaterThanOrEqual(4.5);
      expect(
        await contrast(page.getByLabel("Email"), "borderTopColor"),
        "input border",
      ).toBeGreaterThanOrEqual(3);
      expect(
        await contrast(page.getByRole("button", { name: "Sign in" })),
        "primary button label",
      ).toBeGreaterThanOrEqual(4.5);

      await page.getByLabel("Email").fill(registeredUser.email);
      await page.getByLabel("Password").fill("definitely-wrong-1");
      await page.getByRole("button", { name: "Sign in" }).click();
      const alert = page.getByRole("alert").filter({ hasText: /.+/ }).last();
      await expect(alert).toBeVisible();
      expect(await contrast(alert), "error alert text").toBeGreaterThanOrEqual(4.5);
    });

    test(`job badges, filters and buttons in ${scheme}`, async ({
      page,
      registeredUser,
      origin,
    }) => {
      await seedJobs(
        registeredUser.email,
        ["saved", "applied", "interviewing", "offered", "rejected", "withdrawn"].map(
          (status, i) => ({
            title: `Badge ${status}`,
            status,
            minutesAgo: i,
          }),
        ),
      );
      await signInViaApi(page, registeredUser, origin);
      await page.goto("/jobs");
      await expect(page.getByRole("link", { name: "Badge saved" })).toBeVisible();
      await applyTheme(page, scheme, "media");

      for (const [status, label] of [
        ["saved", "Saved"],
        ["applied", "Applied"],
        ["interviewing", "Interviewing"],
        ["offered", "Offered"],
        ["rejected", "Rejected"],
        ["withdrawn", "Withdrawn"],
      ]) {
        const badge = page
          .locator("li", { hasText: `Badge ${status}` })
          .getByText(label, { exact: true });
        expect(await contrast(badge), `${label} badge`).toBeGreaterThanOrEqual(4.5);
      }
      const filter = page.getByRole("navigation", { name: "Filter by status" });
      expect(
        await contrast(filter.getByRole("link", { name: "All" })),
        "active filter",
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contrast(filter.getByRole("link", { name: "Applied" })),
        "inactive filter",
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contrast(page.getByRole("link", { name: "Add job" })),
        "Add job",
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});

test.describe("focus ring", () => {
  for (const scheme of SCHEMES) {
    test(`is the ring token the moment an element is focused, and visible in ${scheme}`, async ({
      page,
      browserName,
    }) => {
      // Tab traversal (Safari skips links and buttons by default, and automation focus is
      // unreliable there) is only asserted in Chromium and Firefox.
      test.skip(browserName === "webkit", "keyboard focus traversal is not reliable in WebKit");
      await page.goto("/sign-in");
      await expect(page.getByLabel("Email")).toBeVisible();
      await applyTheme(page, scheme, "media");

      // Tab with the keyboard so :focus-visible applies, then read the colour with no delay.
      await page.getByRole("heading", { level: 1 }).click();
      for (const target of [
        page.getByLabel("Email"),
        page.getByLabel("Password"),
        page.getByRole("button", { name: "Sign in" }),
        page.getByRole("link", { name: "Sign up" }),
      ]) {
        await page.keyboard.press("Tab");
        await expect(target).toBeFocused();
        const outline = await target.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { color: cs.outlineColor, width: cs.outlineWidth, style: cs.outlineStyle };
        });
        expect(outline).toEqual({ color: TOKENS[scheme].primary, width: "2px", style: "solid" });
        expect(
          await contrast(target, "outlineColor"),
          "ring against its surface",
        ).toBeGreaterThanOrEqual(3);
      }
    });
  }
});

test("the compiled CSS has no native light-dark() (browser baseline tripwire)", async ({
  page,
}) => {
  // Next compiles for Chrome/Edge/Firefox 111+ and Safari 16.4+, so light-dark() (native from
  // Chrome 123, Firefox 120, Safari 17.5) must be lowered to the --lightningcss-* toggles. If a
  // browserslist change makes it ship natively, the supported-browser claim in docs/DESIGN.md
  // must be revisited on purpose, not by accident.
  await page.goto("/sign-in");
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map(
      (l) => l.href,
    ),
  );
  expect(hrefs.length).toBeGreaterThan(0);
  let tokenSheets = 0;
  for (const href of hrefs) {
    const css = await (await page.request.get(href)).text();
    expect(css, href).not.toContain("light-dark(");
    if (css.includes("--lightningcss-light")) tokenSheets += 1;
  }
  expect(tokenSheets, "a stylesheet carries the lowered theme tokens").toBeGreaterThan(0);
});

test("reduced motion removes transitions and animations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sign-in");
  const duration = await page
    .getByRole("button", { name: "Sign in" })
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(parseFloat(duration)).toBeLessThan(0.001);
});

/** Alerts carry a distinct icon and a role, so state is never colour alone. */
async function expectAlertAnatomy(alert: Locator, role: "alert" | "status") {
  await expect(alert).toHaveAttribute("role", role);
  const icon = alert.locator("svg");
  await expect(icon).toHaveCount(1);
  await expect(icon).toHaveAttribute("aria-hidden", "true");
  expect((await alert.innerText()).trim().length, "alert has a text message").toBeGreaterThan(0);
}

test.describe("forms, feedback and controls", () => {
  for (const scheme of SCHEMES) {
    test(`profile form text, hints, placeholders, errors and alerts in ${scheme}`, async ({
      page,
      registeredUser,
      origin,
    }) => {
      await signInViaApi(page, registeredUser, origin);
      await page.goto("/profile");
      await expect(page.getByLabel("Headline")).toBeVisible();
      await applyTheme(page, scheme, "media");

      expect(
        await contrast(page.getByLabel("Headline"), "placeholder"),
        "placeholder",
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contrast(page.getByText("Separate languages with commas.")),
        "hint",
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contrast(page.getByText("Remote", { exact: true })),
        "checkbox label",
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contrast(page.getByRole("button", { name: "Save profile" })),
        "primary button",
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contrast(page.getByLabel("Years of experience"), "borderTopColor"),
        "number input border",
      ).toBeGreaterThanOrEqual(3);

      // Success alert after a save.
      await page.getByLabel("Headline").fill("Backend engineer");
      await page.getByRole("button", { name: "Save profile" }).click();
      const saved = page.getByRole("status").filter({ hasText: "Profile saved." });
      await expect(saved).toBeVisible();
      await expectAlertAnatomy(saved, "status");
      expect(await contrast(saved), "success alert text").toBeGreaterThanOrEqual(4.5);

      // Field error text and error alert (browser validation bypassed so the server answers).
      await page.evaluate(() => {
        document.querySelector("form")!.noValidate = true;
        document.getElementById("yearsOfExperience")?.removeAttribute("max");
      });
      await page.getByLabel("Years of experience").fill("61");
      await page.getByRole("button", { name: "Save profile" }).click();
      const failed = page
        .getByRole("alert")
        .filter({ hasText: "Please fix the highlighted fields." });
      await expect(failed).toBeVisible();
      await expectAlertAnatomy(failed, "alert");
      expect(await contrast(failed), "error alert text").toBeGreaterThanOrEqual(4.5);
      const fieldError = page.locator("#yearsOfExperience-error");
      await expect(fieldError).toBeVisible();
      expect(await contrast(fieldError), "field error text").toBeGreaterThanOrEqual(4.5);
      expect(
        await contrast(page.getByLabel("Years of experience"), "borderTopColor"),
        "invalid input border",
      ).toBeGreaterThanOrEqual(3);
    });

    test(`job detail select, secondary, ghost and destructive buttons in ${scheme}`, async ({
      page,
      registeredUser,
      origin,
    }) => {
      await seedJobs(registeredUser.email, [{ title: "Controls job", status: "applied" }]);
      await signInViaApi(page, registeredUser, origin);
      await page.goto("/jobs");
      await page.getByRole("link", { name: "Controls job" }).click();
      const select = page.getByLabel("Change status");
      await expect(select).toBeVisible();
      await applyTheme(page, scheme, "media");

      expect(await contrast(select), "select text").toBeGreaterThanOrEqual(4.5);
      expect(await contrast(select, "borderTopColor"), "select border").toBeGreaterThanOrEqual(3);
      expect(
        await contrast(page.getByText("Change status", { exact: true })),
        "label",
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contrast(page.getByRole("link", { name: "Edit job" })),
        "primary link-button",
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contrast(page.getByRole("link", { name: "All jobs" })),
        "secondary link-button",
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contrast(page.getByRole("button", { name: "Update status" })),
        "secondary button",
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contrast(page.getByRole("button", { name: "Delete job" })),
        "secondary delete trigger",
      ).toBeGreaterThanOrEqual(4.5);

      await page.getByRole("button", { name: "Delete job" }).click();
      expect(
        await contrast(page.getByRole("button", { name: "Yes, delete" })),
        "destructive button",
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contrast(page.getByRole("button", { name: "Cancel" })),
        "ghost button",
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contrast(page.getByText("Delete this job permanently?")),
        "confirmation text",
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});
