# Testing

| Command                 | Scope                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `pnpm test`             | Vitest unit tests (`src/**/*.test.ts`). No database, no LLM; external services mocked. |
| `pnpm test:integration` | Vitest + PostgreSQL (`src/**/*.integration.test.ts`) against the `*_test` database.    |
| `pnpm test:e2e`         | Playwright browser tests (`e2e/`) against a production build.                          |

## Test database safety

Integration and E2E tests only run against a local database whose name ends in `_test` and that differs from `DATABASE_URL` (`src/test/database-guard.ts`). Set `TEST_DATABASE_URL` in `.env`; the default local one is `jobpilot_test`. Migrations are applied to it automatically.

## End-to-end tests

- First run needs the browser: `pnpm exec playwright install chromium`.
- `playwright.config.ts` builds the app into `.next-e2e` (so a running `pnpm dev` is not disturbed) and serves it on port 3100 with `DATABASE_URL` pointing at the test database. It never reuses an already-running server on that port.
- Each test creates its own user (`e2e-<uuid>@example.invalid`) and sends its own random `x-forwarded-for`, so the sign-in and sign-up rate limits stay enabled and tests do not share a bucket. Teardown deletes those users.
- Every test fails on browser `console.error` output or uncaught page errors (except the expected failed `/api/auth/*` request when testing a wrong password).
- Covered: sign-up, sign-in (wrong password, protected-page return, unsafe `?next=`), origin rejection and throttling on the real server, saving, reloading, validating and isolating the candidate profile, the job-intake flow (add, list, detail, validation errors, cross-user 404, delete, edit, status change, status filter and pagination), and candidate skills (`e2e/skills.spec.ts`: add with every field, name-only, independence from the profile form, server-side validation with browser checks bypassed, duplicates, edit and cancel with focus return, two-step remove, the 50-skill limit with a stale form, cross-user privacy, a keyboard-only flow, and 80-character names and 500-character evidence at 375px and 1280px in light and dark with no horizontal overflow).
- After a client-side navigation Next keeps earlier routes mounted but hidden, so assertions that something is gone must filter on `{ visible: true }`.
- `seedJobs()`, `seedSkills()`, `storedJobStatus()` and `storedSkills()` in `e2e/support.ts` write and read the guarded test database directly, for list, filter, pagination and limit setup and for checking that a forged or rejected request changed nothing. A test that expects the browser to log an error (for example the 404 of a forged Server Action) lists it in `allowedConsoleErrors`.
- `e2e/design-system.spec.ts` checks the rendered brand colours in light and dark (by OS preference and by `data-theme`), measures WCAG contrast of real rendered elements in both themes, checks the focus ring colour at the moment of focus, asserts reduced motion, and fails if the compiled CSS ships a native `light-dark()`.
  - Contrast is measured for: headings, muted text, hints, placeholders, checkbox labels, input and select text, input/select/number-input borders (including an invalid border), text links, primary, secondary, ghost and destructive button labels, success and error alert text, field error text, all six job status badges, and the active and inactive filter chips. Alerts are also asserted to have a role, an `aria-hidden` icon and text.
  - Not measured on a page: the `info` and `warning` Alert variants and `beacon`, which no screen renders yet (covered only by the computed pairs in `docs/DESIGN.md`), and hover states.
- `e2e/navigation.spec.ts` covers the shell: the grouped sidebar lists exactly the real destinations and each one loads (no dead links); `aria-current` is `page` on the exact route and `true` on a parent section across home, list, new, detail, edit and profile; one `main` and one `h1` on every signed-in route; breadcrumbs and their current item; the skip link; keyboard focus and ring on sidebar links; sign out and re-protection; sign-in and sign-up have no shell; the phone drawer (hidden sidebar, labelled dialog, Escape returns focus to the menu button, focus never reaches page content behind it, closes on a link, the close button and the backdrop, no horizontal scroll on every route in light and dark at 375px); and the theme picker (forced theme over the OS setting, persistence across reload, return to System, saved choice applied before first paint). Pure active-route logic is unit-tested in `src/components/navigation/nav-items.test.ts`. `design-system.spec.ts` also measures sidebar, drawer, account and theme-picker contrast, including hover.
  - Not tested: the drawer in Firefox and WebKit, screen-reader announcements, a real Safari, and the theme picker on a device with storage disabled.
- Other browsers: `E2E_ALL_BROWSERS=1 pnpm test:e2e --project=firefox --project=webkit` runs only `design-system.spec.ts` in Firefox and WebKit (run `pnpm exec playwright install firefox webkit` once). It is not part of the default run or CI. Last run: all pass, except the Tab-order focus-ring test, which is skipped in WebKit because Safari does not Tab to links and buttons by default.
- Select keyboard behaviour: typing a letter to jump to an option, Tab, Shift+Tab and Enter-to-submit are tested (Chromium). Arrow keys on a _closed_ native select are **not** tested: on macOS all three engines open an OS popup that automation cannot drive (the value did not change in any of them), and Windows/Linux behaviour was not run.
- Not covered: visual regression, HTTPS, browsers outside current Chromium, Firefox and WebKit builds (including the minimum supported versions), and screen readers.

On failure, traces and screenshots are written to `test-results/` (git-ignored); open a trace with `pnpm exec playwright show-trace <trace.zip>`.

## Long text

Long unbroken text (titles, companies, locations, links, descriptions) is covered by `long text` tests in `e2e/jobs.spec.ts` at 1280px and 375px on the list, detail, edit and failed-form views. They fail on page-level horizontal scroll, on any element that sticks out of the viewport, and on any text element that clips its own content. Streamed content first sits in a hidden container, so these tests wait for `toBeVisible()` before measuring.

## Candidate skills E2E: timing races

Two timing races in `e2e/skills.spec.ts` caused intermittent failures under load (investigated 2026-10-15) and are fixed in the test file; no application code changed.

- **Form reset race.** `addSkill` waited only for the Server Action's HTTP response, but React 19 commits the result and resets the uncontrolled form slightly later, so the next `fill` could be wiped and the click submitted an empty name (no POST, 30 s timeout). The failure screenshot showed the success alert, the new skill and an empty name field. `addSkill` now also waits for the "Add skill" button to return (it reads "Adding…" until the commit), or for the limit alert that replaces the form after the 50th skill. Validation, duplicate and stale-form limit errors keep the form, so the wait cannot hang on them.
- **Console 404 after the session is cleared.** The user-switch test cleared cookies while the signed-in page was open; a client navigation or prefetch then got a 307 to `/sign-in`, and the redirected `_rsc` request returned 404, which the console-error fixture reports. The page still ends on `/sign-in?next=…`, so only the console message was affected. The test now navigates to `about:blank` before clearing cookies. The underlying proxy and `_rsc` redirect behaviour was reproduced (4 of 4) but not investigated further.
- Evidence: before the fix the file failed 11 of 192 under `--repeat-each=12` and the full suite failed 2 of 3 runs; after it the same file passed 192 of 192 and the full suite passed 4 of 4 runs (93 tests each).
