# JobPilot Architecture

## 1. Purpose and source of truth

JobPilot is an AI-assisted career management platform. It is intended to help candidates manage their profile, understand job requirements, assess job fit, prepare application materials, and track applications.

This document defines the target architecture and separates it from the current implementation. It is not evidence that a feature is already implemented.

Use sources of truth in this order:

1. Source code, package configuration, migrations, and automated tests determine what currently exists.
2. This document records agreed architecture and intended behavior.
3. `AGENTS.md` defines the mandatory workflow and rules for coding agents.
4. `docs/DESIGN.md` is the UI design reference, not the system architecture.
5. `docs/ai-architecture.md` is the detailed design of the AI job analysis feature, `docs/security.md` records security decisions, and `docs/decisions/` holds architecture decision records.

Update this document when an architectural decision or implementation status materially changes. Do not create infrastructure solely to match a diagram.

## 2. Current implementation snapshot

This snapshot was reconciled with the repository on 2026-10-15 (working tree, including the app shell and navigation). Re-check the repository before relying on it; update this table when a row changes.

| Area | Current state |
|---|---|
| Web application | Next.js 16 App Router with Cache Components, React 19, strict TypeScript, Tailwind CSS v4. Route groups: `src/app/(app)/` (signed-in pages inside the app shell with sidebar navigation) and `src/app/(auth)/` (sign-in, sign-up) |
| Package manager and runtime | pnpm (version from `packageManager`); Node 22 (`.nvmrc`, `engines.node >=22`) |
| Database | PostgreSQL 17 via Docker Compose using the `pgvector/pgvector:pg17` image (host port 5433). The pgvector extension is enabled by migration `0000`; no vector columns exist |
| ORM and migrations | Drizzle ORM and Drizzle Kit. Migrations `0000_enable-pgvector`, `0001_next_pet_avengers` (Better Auth tables), `0002_candidate_profile`, `0003_job_posting`, `0004_job_posting_nonblank_checks`, `0005_job_status`, `0006_candidate_skill` |
| Authentication and authorization | Better Auth (email and password). Explicit trusted origins, authentication rate limits (in-memory), safe `?next=` redirects, and a proxy that only redirects optimistically. `requireUser()` and `withUser` enforce sessions server-side; every user-owned query is scoped to the owner. HTTPS, multi-instance rate limiting and email flows are not verified (see `docs/security.md`) |
| Environment | Zod validation (`src/lib/env-schema.ts`, parsed by `src/lib/env.ts`): `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, optional `BETTER_AUTH_TRUSTED_ORIGINS`, `OLLAMA_URL`, `LLM_PROVIDER` (`ollama` or `demo`), `LLM_MODEL`, `LLM_TIMEOUT_MS`, `EMBED_MODEL`. `src/lib/ai` reads all but `EMBED_MODEL`; `LLM_MODEL` is required only for `ollama`, and `demo` is rejected in production. `TEST_DATABASE_URL` is used only by test tooling |
| Feature modules | `src/features/identity` (server-side `requireUser()` only), `src/features/candidate-profile`, `src/features/job-intake` |
| Candidate profile | Implemented: headline, summary, location (free text), years of experience, languages, work modes, with the `/profile` page, plus owner-scoped candidate skills (name, level, years, evidence; at most 50 per user). The versioned skill dictionary is not built, so skills are compared by a lowercase key only |
| Job intake | Implemented: create, list (paginated, status filter), detail, edit and delete of user-owned job postings, plus the current application status (`saved`, `applied`, `interviewing`, `offered`, `rejected`, `withdrawn`) |
| Application tracking | Only the current status on `job_posting`. No `application` table, notes, deadlines or status history |
| AI gateway and extraction | Implemented in Phase 2A (`src/lib/ai/`, `src/features/job-analysis/`); not yet called by the application. Persistence, queue, UI and matching are not implemented. Design: `docs/ai-architecture.md` |
| Background processing | None: no queue, worker or pg-boss dependency. Proposed: `docs/decisions/0001-pg-boss.md` |
| CV/document storage | Not implemented |
| UI | Design tokens and shared primitives (`docs/DESIGN.md`), app shell with grouped navigation, breadcrumbs, theme picker |
| Automated tests | Vitest unit tests (`pnpm test`) and PostgreSQL integration tests against the guarded `*_test` database (`pnpm test:integration`); Playwright end-to-end tests in Chromium (`pnpm test:e2e`), with an optional Firefox and WebKit run of the design-system checks. No AI evaluation tests |
| CI | `.github/workflows/ci.yml` uses pnpm with a frozen lockfile and a `pgvector/pgvector:pg17` service: lint, typecheck, unit tests, migration consistency check, migrations on a fresh database, integration tests, build, Playwright install and end-to-end tests |

The existing code uses `src/lib/` for shared database, auth, environment, and schema code. Keep this structure for now. Do not migrate everything to a new `src/server/` tree merely to match a proposed layout.

## 3. Architectural principles

- Use a modular monolith in one Next.js application and one package.
- Keep business rules independent of Next.js, Drizzle, and provider SDKs.
- Give each feature clear ownership and a small public interface.
- Reuse shared infrastructure rather than implementing duplicate auth, database, AI, or storage paths.
- Validate external input and AI output before use or persistence.
- Separate deterministic decisions from probabilistic AI output.
- Make database changes through reviewed Drizzle migrations.
- Add infrastructure only when a concrete requirement justifies it.
- Require explicit user approval before consequential external actions.
- Treat candidate profiles, CVs, and application data as private personal data.

## 4. MVP scope

The MVP should deliver one complete workflow before expanding into automation.

### MVP capabilities

1. Email/password authentication and protected access.
2. Candidate profile with skills, experience, languages, and location preferences.
3. Manual job intake by pasting a job description.
4. Validated extraction of job requirements using AI.
5. Deterministic job-fit score with matched skills and gaps.
6. AI explanation grounded in the deterministic score breakdown.
7. Application tracking with status, notes, and deadlines.
8. A demo mode that does not require a locally running language model.

Status against this list (see section 15): items 1 and 3 are implemented; item 2 is implemented (skills have no alias dictionary yet); items 4 to 6 are planned (`docs/ai-architecture.md`); item 7 is partial (current status only); item 8 is supported by configuration only (`LLM_PROVIDER=demo` is accepted, the provider is not built).

CV upload and extraction may be included after the core profile-to-match workflow is reliable. Treat secure file storage and extraction limits as required if CV upload is included in the MVP, not as optional security work.

### Post-MVP

- Tailored CV and cover letter drafts with human review.
- Interview preparation.
- Job source integrations and saved-job discovery.
- Semantic matching with pgvector.
- Background processing, scheduled monitoring, and notifications.
- Document versioning and career analytics.

The MVP timeline is a planning estimate, not a reason to skip security, tests, or deployment checks.

## 5. System layers

### Presentation: `src/app/` and `src/components/`

Responsibilities:
- Render pages, layouts, forms, and UI states.
- Call application use cases through server-side entry points or route handlers.
- Present loading, empty, success, and error states.
- Keep database queries and business rules out of UI components.

### Feature modules: `src/features/<feature>/`

Create feature folders when work on the feature begins. A substantial module can use these areas as needed:

- `domain/`: pure types, invariants, and business rules.
- `application/`: use cases and orchestration.
- `infrastructure/`: Drizzle repositories and provider adapters specific to the feature.
- `schema.ts`: feature-owned database tables.
- `index.ts`: public exports for other modules.

Do not create empty layers or folders when a feature does not need them. Small features may use a simpler structure, provided responsibilities remain clear.

Initial feature ownership:
- `candidate-profile` (implemented in `src/features/candidate-profile/`): the candidate profile (headline, summary, location, experience, languages, work modes) and the candidate's skills.
- `job-intake` (implemented in `src/features/job-intake/`; this is the `jobs` module under its actual name): manually entered job descriptions, editing, deletion and the current application status. Jobs are private to one user: there is no sharing or cross-user deduplication.
- `matching` (planned as `job-analysis`, see `docs/ai-architecture.md`): requirement extraction, grounding, score calculation and match breakdown. It combines what this document earlier split between `jobs` (requirements) and `matching` (score) because they share one versioned lifecycle. Confirm this refinement before implementation.
- `documents`: uploaded CV metadata and extraction results.
- `applications` (planned): notes, deadlines and status history. The current status already lives on `job_posting` in `job-intake`; decide whether it moves when `applications` is built.

#### `candidate-profile` module

- `schema.ts`: the `candidate_profile` table. `user_id` is `NOT NULL`, `UNIQUE`, and references `user.id` with `ON DELETE CASCADE`. Timestamps are `timestamptz`.
- `validation.ts`: Zod input schema (strict: `id`, `userId`, and unknown keys are rejected) and the `CandidateProfileDto`, which omits `id` and `userId`.
- `repository.ts`: Drizzle persistence behind the `ProfileRepository` port. Every operation is keyed by the owner's user id; there is no lookup by profile id.
- `service.ts`: use cases `getMyProfile(user)` and `updateMyProfile(user, input)`. The owner always comes from the authenticated session user, never from input.
- `actions.ts`, `form.ts`, `ui/profile-form.tsx`: the Server Action and form behind `/profile`. The action calls `requireUser()` itself, so protection does not depend on `src/proxy.ts`.
- `schema.ts` also holds `candidate_skill`: `user_id` `NOT NULL` with `ON DELETE CASCADE`, `UNIQUE (user_id, skill_key)`, `timestamptz` timestamps, and CHECK constraints for the key and name (1 to 80 characters, trimmed), level (`beginner`, `intermediate`, `advanced`, `expert`), years (0 to 60) and evidence (1 to 500 characters, not blank).
- `skills/validation.ts`, `skills/skill-key.ts`: strict Zod input (`name`, `level`, `yearsOfExperience`, `evidence`; `id`, `userId`, `skillKey` and unknown keys are rejected) and the canonical key (NFKC, lowercase, collapsed whitespace; punctuation kept). The key is derived on the server, never taken from input. It is the placeholder for the planned dictionary; aliases such as `postgres` and `postgresql` are still two keys.
- `skills/repository.ts`: `SkillRepository` port. Every operation takes the owner's user id in the SQL `WHERE` clause. Add and edit run in a transaction that first takes a per-user advisory lock (`pg_advisory_xact_lock`), so the 50-skill limit and the duplicate check hold under simultaneous requests; the unique constraint is the last line of defence for duplicates. Reads are bounded to 50 rows.
- `skills/service.ts`, `skills/actions.ts`, `skills/form.ts`, `ui/skills-section.tsx` and its client components: add, edit and remove behind the Skills card on `/profile`. A malformed, missing or foreign skill id is indistinguishable; removing one is a no-op. Skills are never sent to an AI provider.
- `index.ts`: server-only composition root and public exports.

#### `job-intake` module

- `schema.ts`: the `job_posting` table (`user_id` `NOT NULL` with `ON DELETE CASCADE`, length, non-blank and `http(s)` URL CHECK constraints, and a status CHECK). Timestamps are `timestamptz`.
- `validation.ts`: strict Zod input schema (unknown keys and any client-supplied `id`, `userId`, timestamps or status are rejected), the status list `JOB_STATUSES`, and the DTO types.
- `repository.ts`: `JobRepository` port. Every operation takes the owner's user id and puts it in the SQL `WHERE` clause; there is no lookup, update or delete by job id alone.
- `service.ts`: create, list (paginated, optional status filter), get, update, change status, and delete. Missing, malformed and foreign ids are indistinguishable.
- `actions.ts`, `form.ts`, `ui/`: Server Actions and forms behind `/jobs`, `/jobs/new`, `/jobs/[id]` and `/jobs/[id]/edit`. Editing and status changes are separate actions, so an edit cannot reset the status.
- `index.ts`: server-only composition root and public exports.

### Shared infrastructure: `src/lib/`

Existing shared files include:
- `src/lib/db.ts`: database client.
- `src/lib/schema.ts`: Better Auth tables.
- `src/lib/auth.ts`: Better Auth server configuration.
- `src/components/auth/auth-client.ts`: Better Auth browser client (client-only, so it lives outside `lib/`).
- `src/lib/authz.ts`: framework-free authorization helpers: `requireUserFromHeaders`, `assertOwned`, and the `UnauthenticatedError` / `NotFoundError` types.
- `src/lib/api-auth.ts`: `withUser` wrapper for route handlers (401 when signed out, 404 for missing or not-owned records).
- `src/features/identity/server.ts`: `requireUser()` for Server Components and server actions (redirects to `/sign-in`).
- `src/lib/auth-config.ts`: pure auth configuration helpers (trusted origins, rate-limit rules).
- `src/lib/safe-redirect.ts`: the single `?next=` redirect validator, shared by the proxy and the sign-in and sign-up pages.
- `src/proxy.ts`: optimistic redirect for signed-out visitors (not an authorization boundary).
- `src/lib/env.ts` and `src/lib/env-schema.ts`: environment validation (the schema is separate so it can be tested), `src/lib/log.ts`: allowlist logger, `src/lib/ai/`: AI gateway and providers.
- `src/test/database-guard.ts`: refuses any test database that is not a local `*_test` database different from `DATABASE_URL`.
- `src/test/integration-db.ts`: connects to the dedicated `*_test` database, applies migrations, and creates test users for integration tests.

The signed-in application shell, navigation and theme picker live in `src/components/navigation/` (presentation, see `docs/DESIGN.md`). As capabilities are implemented, shared infrastructure may be added under `src/lib/ai/`, `src/lib/storage/`, or similarly focused paths (the AI gateway is planned at `src/lib/ai/`). Avoid speculative abstractions.

## 6. Dependency rules

Expected dependency direction:

```text
Presentation -> Application -> Domain
                    |
                    v
             Ports / interfaces
                    ^
                    |
          Infrastructure adapters
```

Rules:
- Route handlers and Server Actions validate transport input and delegate to use cases.
- Domain code must not import Next.js, Drizzle, or AI/storage SDKs.
- UI components must not access the database directly.
- Feature modules import other features through public exports, not private paths.
- Avoid circular dependencies.
- Keep provider SDK imports inside the corresponding adapter.
- A port is justified when provider replacement, testing, or isolation is a real requirement. Do not add an interface for every function by default.

## 7. Database architecture

PostgreSQL is the source of truth. Drizzle defines schema and generates migrations. Better Auth uses the same database through its Drizzle adapter.

### Authentication and domain separation

- Better Auth owns the `user`, `session`, `account`, and `verification` tables.
- Domain features must not repurpose or modify Better Auth tables for business data.
- `candidate_profile.user_id` should reference `user.id` with a unique constraint and `ON DELETE CASCADE`.
- Every private user-owned record must have an explicit ownership relationship, either directly through `user_id` or through a parent whose ownership is checked.
- Authorization must be enforced in server-side use cases and repository queries, not only by hiding UI elements.

### Planned MVP entities

| Entity | Purpose |
|---|---|
| `candidate_profile` | Headline, experience, languages, location, and work preferences |
| `candidate_skill` | Candidate skills, level, years, and evidence |
| `skill` / `skill_alias` | Canonical skill names and aliases |
| `job` | User-owned pasted job description and source metadata |
| `job_requirement` | Validated structured requirements extracted from a job |
| `match_result` | Score, breakdown, version, and explanation |
| `document` | File metadata, storage provider/key, type, size, and checksum |
| `application` | Job relationship, status, applied date, and deadline |
| `application_note` | Notes and status history |

Implemented tables: `candidate_profile` (migration `0002`), `candidate_skill` (migration `0006`) and `job_posting` (migrations `0003` to `0005`, the `job` entity under its actual name). Jobs are private to one user; there is no sharing or deduplication. The others are planned. For job analysis, `docs/ai-architecture.md` proposes a `job_analysis` table (holding the extracted requirements as validated JSON) instead of separate `job_requirement` and `match_result` tables, with the score computed from the current profile when read; those deviations from the list above are open decisions until confirmed.

### Database rules

- Define primary keys, foreign keys, unique constraints, indexes, and delete behavior deliberately.
- Store domain timestamps consistently in UTC using timezone-aware database types where appropriate. Follow Better Auth's generated schema requirements for its own tables.
- Use transactions for operations that must be atomic.
- Store document storage keys and provider identifiers, not permanent public URLs.
- Store a scoring algorithm version and enough input/version information to explain how a match was calculated.
- Avoid persisting derived data that is cheap and safe to recompute.
- Never rewrite or delete an applied migration to make a schema change. Add a new migration and verify the migration history first.
- Do not run destructive schema changes against a shared or production database without a reviewed migration and backup/recovery plan.

## 8. Authentication, authorization, and privacy

Better Auth is the selected authentication library. Keep authentication handling centralized in `src/lib/auth.ts` and its API route unless an explicit ADR changes that decision.

Before storing private career data, verify:
- Registration, sign-in, sign-out, session persistence, and session expiry.
- Protected page and server-side data access.
- Ownership checks for every read, update, download, and delete.
- Email verification and password recovery behavior.
- Appropriate origin/CSRF protections and rate limits for authentication and recovery endpoints.
- Secure cookie/session configuration for local and production environments.
- Safe error handling and absence of credentials, tokens, and CV contents in logs.

Authentication answers who the user is. Authorization answers what that user may access. They must not be treated as the same check.

Privacy requirements:
- Collect only data needed for the product's features.
- Keep uploaded documents private and authorize every access.
- Define account export, account deletion, retention, and orphaned-file cleanup.
- Avoid claiming legal compliance based on architecture alone; operational and legal review is also required.

## 9. AI architecture

The shared AI gateway and requirements extraction exist (Phase 2A, `src/lib/ai/`, `src/features/job-analysis/`); persistence, the queue and worker, the UI and matching do not (verified 2026-10-15). This section summarizes the intended design; the detailed design (schemas, scoring, persistence, queue and UI states) is in `docs/ai-architecture.md`, and the security requirements are in `docs/security.md`.

All AI calls should go through a shared gateway implemented when the first AI feature is built. Feature modules must not create provider clients or call provider endpoints directly.

The gateway should provide:
- Typed, task-specific functions such as `extractJobRequirements` and `explainMatch`.
- Provider selection through validated configuration.
- Structured output validated with Zod.
- Timeouts, cancellation where supported, and bounded retries.
- Safe metadata such as provider, model, latency, and task identifier for operational logging.
- Versioned prompts separated from deterministic business rules.

Never log secrets, full CV text, or unnecessary personal information. Treat job descriptions and CV contents as untrusted data, not as instructions to the model. AI-generated output must not be treated as verified fact.

### Current AI configuration

The current environment schema supports:
- `LLM_PROVIDER=ollama` or `LLM_PROVIDER=demo`.
- `OLLAMA_URL`.
- `LLM_MODEL`.
- `EMBED_MODEL`.

`src/lib/ai` reads `OLLAMA_URL`, `LLM_PROVIDER`, `LLM_MODEL` and `LLM_TIMEOUT_MS` (default 60 000 ms); `EMBED_MODEL` is still unused. `LLM_MODEL` is required only for `ollama`. The `demo` provider needs no installed chat model and no Ollama, and is rejected when `NODE_ENV=production` (so CI and Playwright, which run production builds, use `LLM_PROVIDER=ollama` with a placeholder model). The environment rules live in `src/lib/env-schema.ts`; `.env.example` still needs `LLM_TIMEOUT_MS` and a note that `LLM_MODEL` may be blank for `demo`. A local Ollama instance may have no chat model installed (only `bge-m3` was present when this was checked), so `ollama` mode needs one pulled first. Do not rename them or add an OpenAI-compatible provider until the implementation and environment schema are updated together.

The intended hosted/demo behavior is:
- `ollama`: local inference.
- `demo`: deterministic, schema-valid fixtures so the demo can run without a local model.

A hosted OpenAI-compatible provider is a future option, not a current capability.

### Matching pipeline

1. **Extraction (AI):** Convert the job description into a validated requirements structure. Unstated requirements remain unknown; the model must not guess.
2. **Normalization (deterministic):** Map skills through canonical names and aliases. Preserve unmapped terms and flag them.
3. **Scoring (deterministic):** Calculate a reproducible score from the candidate profile and extracted requirements.
4. **Explanation (AI):** Explain the score breakdown, matched skills, and gaps. The explanation cannot change the score.

Proposed starting weights:

| Component | Weight |
|---|---:|
| Required skills coverage | 50 |
| Preferred skills coverage | 15 |
| Experience vs. minimum years | 15 |
| Language requirements | 10 |
| Location / remote fit | 10 |

`docs/ai-architecture.md` adopts these weights as scoring version `match-v1` and defines the formulas, partial credit, missing-data handling (components that cannot be assessed are removed and the score is renormalized over the assessable weight, which is reported as coverage), the interpretation labels, and the disclaimer that the score measures overlap with stated requirements, not hiring probability.

Before implementing the scorer, define component formulas, partial matches, missing evidence, unknown requirements, renormalization, rounding, and behavior when there are no usable requirements. Version the algorithm. Unit tests for scoring must not require a language model.

## 10. File storage and CV extraction

Document storage is not implemented. Add it only when the document feature is started.

When implemented:
- Define a small storage interface and concrete adapter(s) required by the actual deployment.
- Keep buckets private; authorize access before generating short-lived download URLs.
- Generate opaque object keys rather than trusting uploaded filenames.
- Validate file content using file signatures and safe parsers, not only extensions or browser-provided MIME types.
- Set strict size, page, extraction-time, and resource limits. The initial proposal is PDF and DOCX, up to 5 MB, subject to parser verification.
- Store provider and object key in the database.
- Make database/object-store deletion resilient to partial failure; use retryable cleanup rather than assuming two systems share a transaction.
- Treat extracted text as untrusted input to the AI gateway.

For development, local storage may be used only if files are served through an authorized route and are excluded from source control. Choose S3-compatible storage or another private hosted service when deployment requires it.

## 11. Environment and provider configuration

The validated environment schema in `src/lib/env.ts` is the current configuration boundary. Keep `.env.example`, Zod schema, provider factory, and deployment configuration synchronized whenever variables change.

Current variables include `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `OLLAMA_URL`, `LLM_PROVIDER`, `LLM_MODEL`, and `EMBED_MODEL`.

Future storage configuration should be introduced only with a storage implementation. Future hosted AI configuration should be introduced only with an implemented and tested provider. Fail fast when the selected provider lacks required configuration. Never commit real secrets.

## 12. API and validation conventions

- Validate request bodies, route parameters, form data, environment variables, provider responses, and AI output at trust boundaries.
- Return consistent, typed results and appropriate HTTP status codes.
- Do not expose stack traces, SQL details, provider errors, or secrets to clients.
- Keep transport-specific details in route handlers or presentation code.
- Enforce authentication and ownership inside server-side application use cases; never rely solely on client-side checks.

## 13. Testing and quality

Vitest is configured with two suites:
- `pnpm test` runs unit tests (`*.test.ts`) with no database or model.
- `pnpm test:integration` runs `*.integration.test.ts` against a real PostgreSQL database named by `TEST_DATABASE_URL`. The helper refuses any database whose name does not end in `_test`, applies all migrations, and cleans up the users it creates. The candidate-profile suites cover create, read, update, cross-user denial, and the database constraints; the skills suite adds duplicate keys, the 50-skill limit under real concurrent requests (a separate connection pool), cascade deletes and every CHECK constraint.

The integration helper refuses any `TEST_DATABASE_URL` that is not on a local host, does not end in `_test`, or equals `DATABASE_URL`.

GitHub Actions (`.github/workflows/ci.yml`) installs with `pnpm install --frozen-lockfile` (pnpm version from `packageManager`, Node version from `.nvmrc`) and starts an ephemeral `pgvector/pgvector:pg17` service. It creates a separate `jobpilot_test` database, checks and applies the migrations to a fresh `jobpilot` database with `pnpm db:migrate`, then runs lint, typecheck, unit tests, integration tests, the production build, and Playwright end-to-end tests (Chromium, with a placeholder `ollama` AI configuration that is never contacted). The AI unit tests and the demo-provider evaluation fixtures run in the unit-test step; no real-model evaluation exists; the layers below describe what is still required.

Required test layers:
- **Unit:** scoring, skill normalization, status transitions, validation, and domain rules.
- **Integration:** database repositories, ownership enforcement, migrations, and adapters against appropriate test infrastructure.
- **AI evaluation:** a small fixed set of job descriptions for schema validity, extraction quality, and grounded explanations.
- **End-to-end:** authentication, protected access, profile and job intake, navigation, and the design system exist (`e2e/`); matching and application tracking tests are still required.

Tests for deterministic business rules must not call a live model. Critical cross-user authorization paths must include negative tests. CI must use the repository's configured pnpm version and lockfile, and run the checks that actually exist in `package.json`. Do not document missing scripts as working commands.

## 14. Deployment and operations

Current local infrastructure is Docker Compose with PostgreSQL/pgvector. Ollama runs separately when local inference is needed.

Target deployment principles:
- Use managed PostgreSQL or an equivalently operated database for hosted environments.
- Run migrations as an explicit deployment step, not automatically at application startup.
- Keep production secrets in the deployment platform's secret manager.
- Configure backups, restore procedures, error monitoring, and retention before production use.
- Confirm that the hosting platform supports any chosen file-storage and AI provider configuration.
- Introduce a separate worker only when a real background workload exists. The first such workload is AI job analysis; the proposed queue and worker are described in `docs/decisions/0001-pg-boss.md` and are not yet implemented. Background jobs must be idempotent and define retries, timeouts, and execution status.

## 15. Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1. Foundation | CI, test runners, environment conventions, verified auth, migration checks | Largely done: CI, Vitest, Playwright, migration checks and auth hardening exist; production deployment checks (HTTPS, multi-instance rate limits) remain |
| 2. Profile and jobs | Candidate profile, skills, manual job intake | Profile, candidate skills and job intake done |
| 3. Matching | AI extraction, deterministic scoring, explanation, demo fixtures | Planned; design in `docs/ai-architecture.md` |
| 4. Tracking | Applications, notes, deadlines | Partial: current status on jobs; notes, deadlines and history planned |
| 5. Documents | Secure CV storage and extraction | Planned; prioritize based on MVP needs |
| 6. Hardening | E2E tests, monitoring, backups, retention, recovery | E2E tests exist; the rest is required before public production |
| 7. Automation | Job feeds, background jobs, notifications, analytics | Post-MVP (the queue for job analysis is proposed earlier, see ADR 0001) |

Status reflects the repository as reconciled on 2026-10-15 and must be updated as features are implemented.

## 16. Architecture decision records

Record significant decisions as numbered files under `docs/decisions/` (the location named in `AGENTS.md`). The first record is `docs/decisions/0001-pg-boss.md` (proposed).

Initial decisions to record:
- Modular monolith in a single package.
- Drizzle ORM and migration ownership.
- Better Auth for authentication.
- Shared AI gateway and deterministic matching.
- Private document storage and provider abstraction, when implemented.

For a major change:
1. Inspect the current implementation and requirement.
2. Compare simpler alternatives and trade-offs.
3. Record the decision in a new ADR.
4. Update this document and affected guidance.
5. Add tests and verify the migration path.
