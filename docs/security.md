# Security

Scope: authentication hardening and job data handling that exist in the code today, plus the design requirements for the planned AI job analysis feature (see "AI features"). Uploads and other planned areas are not covered until they are implemented.

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

## Candidate skills

- Skills (`candidate_skill`) are owned by one user and removed with the user (`ON DELETE CASCADE`). Every list, add, edit and remove puts the session user's id in the SQL `WHERE` clause or `INSERT`; there is no lookup by skill id alone. A missing, someone else's and a malformed skill id are indistinguishable (edit reports "no longer exists", remove does nothing).
- Input is validated with a strict Zod schema: `id`, `userId`, `skillKey`, timestamps and unknown keys are rejected, the canonical key is computed on the server, and control and invisible formatting characters are refused. The database repeats the length, trimmed, level and year-range rules as CHECK constraints.
- The 50-skill limit and the duplicate rule are enforced in the application inside a transaction that holds a per-user advisory lock, so simultaneous requests cannot exceed them; `UNIQUE (user_id, skill_key)` backs the duplicate rule. Evidence text can describe real work, so it is treated as personal data: it is rendered as plain text, never logged, and never sent to an AI provider.

## AI features (design requirements; not implemented yet)

No AI code exists in the repository today. This section is the contract the AI job analysis feature (`docs/ai-architecture.md`) must meet before it ships. Update the "Verification status" section when each item is implemented and tested, and do not describe an item as done before then.

### Trust boundaries and who enforces what

| Boundary                 | Responsibility                                                                                     | Enforced by                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Browser to Server Action | Authentication, ownership of the job, input size, rate limits                                      | `requireUser()`, the user-scoped job read, counters in the action                  |
| Application to database  | Every query filtered by the owner; ownership also checked in SQL (composite foreign key)           | repository functions that always take `userId`                                     |
| Queue payload            | Carries ids only; never trusted as proof of ownership                                              | worker re-reads the row by `(analysisId, userId)` and the job through `job-intake` |
| Worker to AI gateway     | Sends only the job description; applies timeout; no secrets or personal data in prompts            | `src/lib/ai/` gateway                                                              |
| Gateway to application   | Model output is untrusted: schema-validated, bounded, grounded in the source text                  | Zod schema and grounding code in the domain layer                                  |
| Application to browser   | Everything from a job or a model is rendered as plain text; provider errors never leave the server | React escaping (no raw HTML), typed error codes                                    |

### Prompt injection

Job descriptions are written by third parties and are untrusted. They may contain text such as "ignore previous instructions" or requests for other output.

- The prompt marks the job text as data and tells the model to ignore instructions inside it. **This is a quality measure, not a control.**
- The real controls: the model has **no tools, no network access, no code or SQL execution and no access to other users' or the candidate's data**. Its only effect is the JSON it returns, which is validated, bounded and grounded. The worst outcome of a successful injection is a wrong or empty requirement list for that one job, shown with its source quotes.
- The model never receives anything an attacker could exfiltrate (no profile, no other jobs), and its output is never executed, evaluated, used as a URL, a file path, a query or a prompt for another model.
- Tests include injection strings in job text and assert that output is still schema-valid, bounded and grounded.

### Untrusted model output

- Every response is parsed and validated against a strict Zod schema (unknown keys rejected, arrays and strings bounded) even when the provider claims to enforce a schema.
- Each extracted skill must carry a verbatim quote that appears in the job description; items that do not are dropped and counted. Nothing is invented on behalf of the job or the candidate.
- Unstated information stays `null` or empty. It is never filled with defaults.
- Only validated, grounded output is stored. Raw model text is not stored or logged; for malformed output only failing schema paths are kept.
- Scoring is deterministic code; the model cannot change a score.

### Privacy and data minimization

- The model receives the **job description (and title and company)** only. The candidate profile, skills, location, CV text and any document are never sent in this feature. Matching runs locally in application code.
- With `LLM_PROVIDER=ollama` inference runs on the operator's own Ollama host; no data leaves that machine unless the operator points `OLLAMA_URL` elsewhere, which then becomes a deployment and privacy decision. Hosted providers are not supported.
- Any later feature that sends profile data or documents to a model (an AI explanation, CV tailoring) needs its own review, user-visible disclosure and this document updated first.
- Analysis rows are owner-scoped, deleted with the job or the user (`ON DELETE CASCADE`), and contain no data the user did not already provide, apart from the extraction derived from it.
- Queue payloads contain ids only.

### Rate limits and abuse

Model calls are expensive and can be used to exhaust the host. Proposed limits, enforced in the Server Action and verified by tests:

- At most **one active run per job** (database partial unique index).
- A **daily cap per user** (proposed 20 runs), counted from `job_analysis` rows.
- The existing job description limit (20,000 characters) bounds the input; longer text is rejected rather than silently truncated.
- A bounded queue size and worker concurrency; a per-call timeout.
- Existing sign-in and sign-up limits are unchanged and unrelated.

Limits that rely on in-process memory do not protect multiple instances; these limits use the database for that reason.

### Log redaction

Allowed in logs and metrics: analysis id, job id, user id, provider, model name, prompt version, task name, latency, attempt number, outcome and failure code, and counts.

Never logged: job text, titles or companies from user data, model prompts or responses, quotes, profile data, tokens, secrets, or provider error bodies. Failures are reported to operators by code. Error messages shown to users are fixed strings chosen by code, never provider text.

### Ownership checks

- Reading, listing, requesting, retrying and deleting analyses all go through repository functions filtered by `user_id`; there is no lookup by analysis id alone from user-facing code.
- The database enforces that an analysis and its job have the same owner (composite foreign key).
- The worker runs without a session. It authorizes by re-reading `(analysisId, userId)` and by reading the job as that user through the `job-intake` public API. A payload naming another user's id cannot read their data because the row and the job must both match.
- Missing, malformed and foreign ids return the same "not found" result, as for jobs.
- Cross-user access tests are required for every new read and write path.

### Provider failures

- A timeout, outage, missing model or unusable response ends the analysis as `failed` with a code. The UI shows a plain message and offers Retry where retrying can help.
- **No silent fallback.** If the configured provider fails, the system never substitutes the `demo` provider or a partial result.
- Output from the `demo` provider is labelled "Demo extraction (no AI model)". Whether `demo` may run in production is an open decision.
- Failures do not expose stack traces, SQL, endpoints or provider messages to the browser.
- A stopped worker leaves analyses `pending`; the UI says an analysis is waiting rather than pretending to progress.

### What the score is not

The match score measures how much of the requirements **stated in a job description** the user's own profile covers, using fixed, versioned rules, and it reports how much information it could use (coverage). It is not a prediction of hiring, interview or offer probability, and the product must not present it as one. Missing information on either side is shown as missing, not scored as a gap.

### Before this ships

Threat checks to complete and record here: injection tests passing, schema and grounding tests passing, cross-user tests on every new path, rate limits tested, log output reviewed for redaction, and the pg-boss schema and worker role privileges documented (`docs/decisions/0001-pg-boss.md`).

## Deployment requirements

- Serve over HTTPS and set `BETTER_AUTH_URL` to the public `https://` origin. Add other approved origins only through `BETTER_AUTH_TRUSTED_ORIGINS`.
- Set a unique `BETTER_AUTH_SECRET` of at least 32 characters. The placeholder in `.env.example` is for local use only.
- Configure trusted proxy settings as described above, and decide the rate-limit storage for the deployment topology.
- Never log credentials, session tokens, CV contents or PII.
- When AI job analysis ships: run the queue worker as a separate process with the same environment validation, keep Ollama reachable only from the application hosts, and review the log output for redaction (see "AI features").

## Verification status

Tested: origin validation and rate limits through the real Better Auth handler with its in-memory adapter (`src/lib/auth-config.test.ts`), redirect rules (`src/lib/safe-redirect.test.ts`), proxy behavior (`src/proxy.test.ts`), and a manual smoke test against `next start` over plain HTTP on localhost.

Not implemented, therefore not tested: everything in "AI features".

Not tested: HTTPS and `__Secure-` cookie behavior in a real deployment, any proxy or multi-instance setup, and the sign-in page's final navigation in a browser.
