# ADR 0001: Use pg-boss for background work

- **Status:** Proposed. Accepted when the queue implementation phase starts and the dependency is added.
- **Date:** 2026-10-15
- **Deciders:** project owner
- **Related:** `docs/ai-architecture.md` (sections 8 and 10), `docs/security.md` (AI section), `AGENTS.md` ("long-running work goes to pg-boss and must be idempotent with retry limits").

## Context

AI job analysis calls a language model that can take tens of seconds. `AGENTS.md` forbids holding an HTTP request open for such work and names pg-boss as the queue. The repository today has no queue, no worker, and no `pg-boss` dependency (`package.json`). The only infrastructure is the Next.js application and one PostgreSQL 17 database with the pgvector extension (`docker-compose.yml`). The same database image is used in CI.

## Decision

Use **pg-boss** as the job queue, backed by the existing PostgreSQL database, and run handlers in a **separate worker process**. The first queue is `job-analysis.extract`.

## Why this is appropriate

- **No new service.** pg-boss stores jobs in PostgreSQL, which is already operated, backed up and used by the test and CI setups. A Redis-based queue would add a second stateful service for one workload.
- **Reliable delivery semantics** (at-least-once delivery, retries with backoff, expiry of stuck jobs, singleton keys) are provided by the library rather than rewritten.
- **Fits the architecture:** background work stays out of request handling, and the application remains a modular monolith with one extra process rather than a second system.
- **Testable:** handlers are ordinary functions that can be driven in integration tests against `jobpilot_test` with a fake AI gateway, with no network or model.

## Alternatives considered

| Alternative                                           | Why not (now)                                                                                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do the work inside the Server Action, or in `after()` | Ties the work to a web request or serverless lifetime and gives no retries or recovery; violates the rule against holding requests open.                                        |
| A hand-written table plus a polling loop              | Re-implements locking, retries, expiry and backoff. Plausible for one queue, but the project rule already names pg-boss and the loop would need the same worker process anyway. |
| Redis with BullMQ                                     | A second stateful service to run, back up and secure.                                                                                                                           |
| A hosted workflow or queue product                    | Adds an external provider and ties deployment to it; not justified yet.                                                                                                         |
| Cron-style scanning of `pending` rows                 | Slower, no retry policy, and awkward to make idempotent.                                                                                                                        |

## Consequences and operational requirements

1. **New dependency and process.** Adding pg-boss requires the dependency change, a `worker` script, and a second long-running process in every environment that runs analyses. A web-only deployment accepts requests but never completes them; the UI shows `pending` and must say so.
2. **Separate database schema.** pg-boss creates and migrates its **own schema (`pgboss`)** in the same database when it starts. This is an explicit exception to "schema changes only via Drizzle migrations":
   - Drizzle never manages `pgboss` tables. `drizzle.config.ts` lists only the application schema files, and nothing in `src/` may query `pgboss` directly.
   - The database role used by the worker needs permission to create and alter that schema. The role used by the web application needs it only if the web process also starts pg-boss to enqueue.
   - Backups and restores must include the `pgboss` schema, or accept losing in-flight jobs. The application's own `job_analysis` rows are the source of truth, so a lost queue is recoverable by re-enqueueing `pending` rows (a user-visible Retry).
   - Test databases get the schema when pg-boss first starts against them. The test helpers' safety guard (`*_test`, local host only) applies unchanged.
3. **Runtime requirements.** Current pg-boss releases require Node 22.12 or newer. `package.json` allows `>=22` and `.nvmrc` pins `22`; raise the `engines` floor to match when adding the dependency. The exact option names and API of the installed version must be checked when implementing; this ADR deliberately does not copy API details from memory.
4. **Connections.** The worker uses its own connection pool, sized separately from the web application's. The web application should send jobs with the smallest possible footprint and must not run queue maintenance.
5. **Graceful shutdown.** The worker handles SIGTERM by stopping the queue and letting in-flight work finish or expire.
6. **Server-only imports.** Feature code imports `server-only`, which throws outside Next.js. The worker must run with the `react-server` condition (`tsx --conditions=react-server`, verified during the audit). It must also load environment variables itself, since Next.js is not doing it.
7. **Monitoring.** Operators need queue depth, failed-job counts and the age of the oldest `pending` analysis. These are logged as counts and ids only.

## Payload, idempotency and retries

- **Payload:** `{ analysisId, userId }`. No job text, no profile data, no model output. Queue tables are therefore not a second copy of personal data.
- **Singleton key:** the analysis id, so a double enqueue creates one job.
- **Idempotent handler:** the database row is the state machine. The handler returns immediately for a missing or `completed` row, and claims the row with one conditional `UPDATE` that increments `attempts` and only matches `pending` or `processing`. A duplicate or late delivery cannot move the row backwards or run the provider twice to completion. See `docs/ai-architecture.md` section 10.2.
- **Retry strategy (proposed values):** three attempts in total (retry limit 2) with exponential backoff starting around 30 seconds, and a per-attempt expiry slightly above the provider timeout. Retryable: `provider_unavailable`, `timeout`, `invalid_output`. Permanent (no retry): `too_long`, a deleted job. The final attempt is decided by the row's `attempts` counter, which marks the row `failed` with a code instead of leaving it `processing`. The user can then start a new run with Retry.
- **Enqueue failure:** if sending to the queue fails, the row is marked `failed` (`enqueue_failed`) at once.

## Rollback

Stop the worker and remove the dependency; analyses stay `pending` or `failed`, the rest of the application is unaffected. Dropping the `pgboss` schema is safe once no worker is running, because the queue holds only ids that can be recreated from `job_analysis`. Removing `job_analysis` itself is a separate, forward-only migration; its data is derived and regenerable.

## Open questions

- Whether the web process starts pg-boss itself to enqueue, or enqueues through a small SQL insert into the queue table owned by pg-boss (not recommended: it couples the application to pg-boss internals).
- Where the worker runs in a hosted deployment (a second container or process) and how it is supervised.
- Retention of completed and failed queue jobs.
