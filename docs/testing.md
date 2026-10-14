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
- Covered: sign-up, sign-in (wrong password, protected-page return, unsafe `?next=`), origin rejection and throttling on the real server, saving, reloading, validating and isolating the candidate profile, and the job-intake flow (add, list, detail, validation errors, cross-user 404, delete).
- After a client-side navigation Next keeps earlier routes mounted but hidden, so assertions that something is gone must filter on `{ visible: true }`.
- Not covered: dark theme and responsive layouts, keyboard and focus behavior, visual regression, HTTPS, and anything other than Chromium.

On failure, traces and screenshots are written to `test-results/` (git-ignored); open a trace with `pnpm exec playwright show-trace <trace.zip>`.
