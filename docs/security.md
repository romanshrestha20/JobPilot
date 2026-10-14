# Security

Scope: authentication hardening that exists in the code today. Planned areas (uploads, AI output, background jobs) are not covered here until they are implemented.

Authentication uses Better Auth. Do not add custom session or password handling. Authorization and ownership rules live in `src/lib/authz.ts`, `src/lib/api-auth.ts` and `src/features/identity/server.ts`; the proxy is an optimistic redirect only.

## Trusted origins

Configured in `src/lib/auth.ts` through `resolveTrustedOrigins` (`src/lib/auth-config.ts`).

- Always trusted: the origin of `BETTER_AUTH_URL`.
- Optional extras: `BETTER_AUTH_TRUSTED_ORIGINS`, comma-separated. Each entry must be a bare `http(s)` origin. Wildcards, paths, credentials and other schemes make startup fail.
- Nothing is added implicitly. A production `BETTER_AUTH_URL` does not trust `localhost`, and `localhost` and `127.0.0.1` are different origins.
- `advanced.disableOriginCheck` and `advanced.disableCSRFCheck` are set to `false` explicitly. Better Auth skips the origin check by default when it detects a test runtime, so never rely on the default.

Development origin: `pnpm dev` runs on port 3001 and `.env` must say `BETTER_AUTH_URL=http://localhost:3001` (port 3000 is often taken by Docker). Opening the app via another host or port makes auth POSTs fail with 403; change the config, do not widen trust.

## Rate limits

Configured as `authRateLimit` in `src/lib/auth-config.ts`. Enabled in every environment (Better Auth enables it only in production by default).

| Scope                                 | Limit                          |
| ------------------------------------- | ------------------------------ |
| `POST /api/auth/sign-in/email`        | 5 requests / 60 s per client   |
| `POST /api/auth/sign-up/email`        | 5 requests / 60 s per client   |
| All other auth endpoints              | 100 requests / 10 s per client |
| Password recovery (not enabled today) | Better Auth built-in: 3 / 60 s |

The key is client IP plus path. Exceeding a limit returns HTTP 429 with an `X-Retry-After` header.

### Limitations

- **Storage is in-process memory.** Counters are per server instance, reset on restart, and are not shared. This is not distributed rate limiting. Before running more than one instance (or serverless), switch to database or secondary storage.
- **Per-IP only.** There is no per-account throttle, so a distributed attack on a single account is not limited.
- **Client IP resolution.** Better Auth reads `x-forwarded-for` and accepts it only when it holds a single valid address. Behind a proxy that appends to the header, no IP can be resolved and all clients fall into one shared bucket, which lets one client lock out everyone. When deployed behind a proxy, set `advanced.ipAddress.trustedProxies` (or `ipAddressHeaders`) to match it, and make sure clients cannot spoof the header.

## Post sign-in redirects (`?next=`)

One shared rule, `safeNextPath` in `src/lib/safe-redirect.ts`, used by the proxy and the sign-in and sign-up pages.

- Accepts only a relative path starting with a single `/`, at most 512 characters.
- Rejects absolute URLs, `//host`, backslashes, control characters, malformed values, `/sign-in`, `/sign-up` and `/api` (no redirect loops, no raw API targets), and anything whose normalized form is protocol-relative (for example `/.//host`).
- The result is rebuilt from the parsed URL, never returned from the raw input. Anything rejected becomes `/`.
- The proxy keeps the query string when it sends an unauthenticated visitor to `/sign-in?next=…`, so avoid putting secrets in query strings of protected pages.

## Job intake data

- Saved jobs (`job_posting`) are owned by one user. Every list, read, update and delete query puts the session user's id in the SQL `WHERE` clause; there is no lookup by job id alone. A missing job, someone else's job and a malformed id all render the same not-found page with the same HTTP status. That status is 200, not 404, because the lookup runs inside a Suspense boundary (Cache Components) after the response has started streaming; the page is not indexable and reveals nothing about which ids exist.
- Input is validated with a strict Zod schema (unknown keys such as `id` and `userId` are rejected). An edit is a single `UPDATE … WHERE id = ? AND user_id = ?` that never sets `id`, `user_id` or `created_at` (`updated_at` is set by the database). A non-owner gets the same not-found answer whether the submitted values are valid or not. The database repeats the length, non-blank and `http(s)` source-URL rules as CHECK constraints.
- Application status is a text column restricted by a CHECK constraint to `saved`, `applied`, `interviewing`, `offered`, `rejected`, `withdrawn` (default `saved`). It changes only through a dedicated action (`UPDATE … WHERE id = ? AND user_id = ?`), never through the create or edit forms, whose strict schemas reject a `status` field. Only the current status is stored; there is no history yet.
- Job descriptions and links are untrusted. They are rendered as plain text (never as HTML), and the source link is only `http(s)`, opened with `rel="noopener noreferrer nofollow"`. The app never fetches the link.

## Deployment requirements

- Serve over HTTPS and set `BETTER_AUTH_URL` to the public `https://` origin. Add other approved origins only through `BETTER_AUTH_TRUSTED_ORIGINS`.
- Set a unique `BETTER_AUTH_SECRET` of at least 32 characters. The placeholder in `.env.example` is for local use only.
- Configure trusted proxy settings as described above, and decide the rate-limit storage for the deployment topology.
- Never log credentials, session tokens, CV contents or PII.

## Verification status

Tested: origin validation and rate limits through the real Better Auth handler with its in-memory adapter (`src/lib/auth-config.test.ts`), redirect rules (`src/lib/safe-redirect.test.ts`), proxy behavior (`src/proxy.test.ts`), and a manual smoke test against `next start` over plain HTTP on localhost.

Not tested: HTTPS and `__Secure-` cookie behavior in a real deployment, any proxy or multi-instance setup, and the sign-in page's final navigation in a browser.
