import { expect, test as base } from "@playwright/test";
import { newTestUser, randomClientIp, createAccount, type TestUser } from "./support";

type Fixtures = {
  /** A fresh, not-yet-registered user. */
  user: TestUser;
  /** Registers a fresh user through the API (browser stays signed out) and returns them. */
  registeredUser: TestUser;
  origin: string;
  /** Console error substrings a test expects (e.g. the 404 of a forged Server Action request). */
  allowedConsoleErrors: string[];
};

export const test = base.extend<Fixtures>({
  // A distinct client address per test: the app's sign-in/sign-up rate limit is per IP, and
  // keeping it enabled is the point. Requests from this test's browser and API client share it.
  extraHTTPHeaders: async ({}, use) => {
    await use({ "x-forwarded-for": randomClientIp() });
  },

  origin: async ({ baseURL }, use) => {
    await use(new URL(baseURL!).origin);
  },

  allowedConsoleErrors: async ({}, use) => {
    await use([]);
  },

  user: async ({}, use) => {
    await use(newTestUser());
  },

  registeredUser: async ({ request, user, origin }, use) => {
    await createAccount(request, user, origin);
    await use(user);
  },

  // Fails any test that logs a browser error or throws on the page (hydration problems included).
  page: async ({ page, allowedConsoleErrors }, use) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      // Chrome logs a failed XHR (e.g. an expected 401 on a wrong password) as a console error.
      const isExpectedHttpFailure =
        message.text().startsWith("Failed to load resource") &&
        message.location().url.includes("/api/auth/");
      const isAllowed = allowedConsoleErrors.some((text) => message.text().includes(text));
      if (!isExpectedHttpFailure && !isAllowed) problems.push(`console: ${message.text()}`);
    });
    await use(page);
    expect(problems, "browser console errors or uncaught exceptions").toEqual([]);
  },
});

export { expect };
