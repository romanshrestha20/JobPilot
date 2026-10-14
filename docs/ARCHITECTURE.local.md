# JobPilot Architecture

## 1. Purpose and Scope

JobPilot is an AI-assisted career management platform. It helps users
assess how well they fit a job, see their skill gaps, and track their
applications.

This document covers the system architecture, module boundaries,
technical decisions, security requirements, and how the platform is
meant to grow. It keeps implemented infrastructure separate from planned
capabilities. The source code and automated tests are the authority on
what is actually implemented.

Rules for AI coding agents working in this repository live in
`AGENTS.md`, not here.

## 2. Architectural Principles

- A modular monolith in a single package is the default architecture.
- Business rules stay independent of framework and infrastructure code.
- Every business module has a clear owner and a public interface.
- External providers (AI, storage, job sources) sit behind adapters, so
  the project can move between local and hosted environments through
  configuration alone.
- External input and AI-generated output are validated before use.
- Deterministic business decisions are kept separate from probabilistic
  AI output.
- Database changes go through migrations.
- Infrastructure is added only when a concrete requirement justifies it.
- Consequential external actions require user approval.

## 3. MVP Scope

The MVP targets roughly 8–12 working days. Everything outside the MVP
is a stretch goal and must not block it.

### 3.1 In the MVP

| Capability             | Notes                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| Authentication         | Better Auth, email and password                                  |
| Candidate profile      | Skills, experience, languages, location preferences              |
| CV upload              | Stored through the storage adapter; text extracted synchronously |
| Job intake             | User pastes a job description or posting text                    |
| Requirement extraction | AI produces validated structured requirements                    |
| Deterministic matching | Reproducible score with skill matches and gaps (§10.2)           |
| Match explanation      | AI-generated, grounded in the score breakdown                    |
| Application tracking   | Status pipeline, notes, deadlines                                |
| Demo mode              | Hosted demo runs without a local model (§9.3)                    |

### 3.2 Stretch Goals (post-MVP)

- Tailored CV and cover letter drafts, with human review.
- Interview preparation.
- Job feed integrations through source adapters.
- Semantic skill matching with pgvector.
- Background processing with pg-boss.
- Scheduled job monitoring and notifications.
- Document versioning and career analytics.

## 4. System Overview

### 4.1 Presentation Layer

Next.js App Router, React, TypeScript, Tailwind CSS, and shadcn/ui.
The Figma file "JobPilot | Core UI Design" is the design source.

Responsibilities:

- Render pages, layouts, and components.
- Handle form state and present loading, empty, success, and error states.
- Call application entry points (Server Actions or route handlers).
- Contain no database queries and no business rules.

### 4.2 Application Layer

Coordinates use cases.

Responsibilities:

- Validate requests with Zod.
- Enforce authentication, authorization, and record ownership.
- Coordinate domain logic, repositories, and providers.
- Manage transactions.
- Return typed results through defined contracts.

### 4.3 Domain Layer

Pure TypeScript business rules, such as scoring, status transitions,
and skill normalization. It has no dependency on Next.js, Drizzle, or
any AI or storage provider.

### 4.4 Infrastructure Layer

Database access, the authentication integration, AI provider adapters,
storage adapters, environment configuration, and logging.
Infrastructure contains no feature-specific business rules.

## 5. Module Layout

Every module follows the same structure. `index.ts` is the module's
only public interface.

```
src/
  app/                       # Next.js routes, layouts, server actions
  components/                # Shared UI components (shadcn/ui)
  modules/
    profile/
      domain/                # Types, rules, pure functions
      application/           # Use cases
      infrastructure/        # Repositories (Drizzle)
      index.ts               # Public interface
    jobs/
    matching/
    documents/
    applications/
  server/
    db/                      # Drizzle client, schema, migrations
    auth/                    # Better Auth configuration
    ai/                      # AI gateway and provider adapters
    storage/                 # Storage port and adapters
    env.ts                   # Zod-validated environment config
  lib/                       # Genuinely shared technical utilities
```

Modules are created when work on them starts, not in advance.

## 6. Technology Stack

| Concern                    | Technology                             | Status         |
| -------------------------- | -------------------------------------- | -------------- |
| Web framework              | Next.js App Router                     | MVP            |
| UI                         | React, Tailwind CSS, shadcn/ui         | MVP            |
| Language                   | TypeScript (strict)                    | MVP            |
| Package manager            | pnpm (single package)                  | MVP            |
| Database                   | PostgreSQL                             | MVP            |
| ORM and migrations         | Drizzle ORM                            | MVP            |
| Authentication             | Better Auth                            | MVP            |
| Runtime validation         | Zod                                    | MVP            |
| AI inference (local)       | Ollama                                 | MVP            |
| AI inference (hosted)      | OpenAI-compatible provider or fixtures | MVP            |
| File storage               | Local disk, S3-compatible, Cloudinary  | MVP (adapters) |
| Unit and integration tests | Vitest                                 | MVP            |
| End-to-end tests           | Playwright                             | Stretch        |
| Vector search              | pgvector                               | Stretch        |
| Background processing      | pg-boss                                | Stretch        |
| Local infrastructure       | Docker Compose                         | MVP            |

The package manifest and configuration determine what is actually
installed at any given time.

## 7. Dependency Rules

```
Presentation -> Application -> Domain
                     |
                     v
          Ports (interfaces) <- Infrastructure adapters
```

- UI components never access the database.
- Route handlers and Server Actions delegate to application use cases.
- Domain code never imports Next.js, Drizzle, or a provider SDK.
- Modules import other modules only through their `index.ts`.
- No circular dependencies between modules.
- Provider SDKs (Ollama, AWS SDK, Cloudinary) are imported only inside
  their adapter files.
- No speculative abstractions. A port exists only where an adapter swap
  is a real requirement: AI, storage, and job sources.

## 8. Data Architecture

PostgreSQL is the source of truth. Drizzle owns the schema and
migrations. Better Auth uses the same database through its Drizzle
adapter.

### 8.1 Auth and Domain Separation

- Better Auth owns `user`, `session`, `account`, and `verification`.
- Domain tables never modify auth tables.
- `candidate_profile.user_id` references `user.id` (one-to-one,
  `ON DELETE CASCADE`).
- Every other user-owned table carries a `user_id` used for ownership
  checks.

### 8.2 MVP Entities

| Entity                  | Purpose                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| `candidate_profile`     | Headline, experience years, location, remote preference             |
| `candidate_skill`       | Canonical skill, level, years, evidence source                      |
| `skill` / `skill_alias` | Canonical skill names and aliases ("JS" -> "JavaScript")            |
| `document`              | Uploaded file metadata: storage key, provider, type, size, checksum |
| `job`                   | Title, company, raw description, source                             |
| `job_requirement`       | Extracted structured requirements                                   |
| `match_result`          | Score, breakdown, score version, explanation                        |
| `application`           | Job, status, applied date, deadline                                 |
| `application_note`      | Notes and status history                                            |

### 8.3 Rules

- Primary keys, foreign keys, constraints, and indexes are defined
  deliberately.
- Timestamps are stored as `timestamptz` in UTC.
- Operations that need atomic updates run inside transactions.
- Files are referenced by **storage key and provider**, never by public
  URL (§11).
- `match_result` stores `score_version`, so changes to the scoring
  algorithm stay traceable.
- Derived data is not stored when it can be recomputed cheaply.

## 9. Provider Portability

JobPilot must be able to move between local and hosted providers through
configuration, without code changes in feature modules.

### 9.1 Approach

- Each external capability has a **port**: a TypeScript interface owned
  by the application.
- Each provider has an **adapter** that implements the port.
- A factory picks the adapter from validated environment variables
  in `src/server/env.ts`.
- Feature modules depend only on the port.

### 9.2 Environment Profiles

| Capability | Local development                       | Hosted demo / production                        |
| ---------- | --------------------------------------- | ----------------------------------------------- |
| Database   | PostgreSQL in Docker Compose            | Managed PostgreSQL                              |
| AI         | Ollama                                  | OpenAI-compatible hosted provider, or `fixture` |
| Storage    | `local` disk or S3-compatible container | `s3` or `cloudinary`                            |

### 9.3 Configuration

```
# AI
AI_PROVIDER=ollama            # ollama | openai-compatible | fixture
AI_BASE_URL=http://localhost:11434
AI_MODEL=
AI_API_KEY=                   # optional; required by some hosted providers

# Storage
STORAGE_PROVIDER=local        # local | s3 | cloudinary
STORAGE_LOCAL_DIR=./.storage

S3_ENDPOINT=                  # empty for AWS; set for S3-compatible services
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=false     # true for most local S3-compatible servers

CLOUDINARY_URL=
```

`env.ts` validates these with Zod at startup and fails fast if the
selected provider is missing required variables.

**Demo mode:** `AI_PROVIDER=fixture` returns recorded, schema-valid
responses for seeded demo jobs. The hosted demo can then run without a
local model or a paid API.

### 9.4 Switching Providers

- **AI:** change the environment variables. Re-run the AI evaluation
  suite (§16) against the new model before switching.
- **Storage:** change the environment variables for new uploads. Each
  `document` row records the provider that holds it, so existing files
  stay readable. A one-off migration script copies objects to the new
  provider and updates the rows.

## 10. AI Architecture

### 10.1 AI Gateway

All AI calls go through `src/server/ai`. Feature modules never create
provider clients or call Ollama endpoints directly.

The gateway provides:

- Typed, task-specific functions (`extractJobRequirements`,
  `explainMatch`, `extractCvSkills`).
- Provider selection from configuration (§9).
- Structured output checked against Zod schemas, with one repair retry
  on invalid output.
- Timeouts and cancellation.
- Usage and latency metadata for logging.
- Prompts kept in versioned files, separate from business rules.

### 10.2 Matching Specification

Matching runs in four steps:

1. **Extraction (AI).** The job description becomes `JobRequirements`:
   skills tagged `required` or `preferred`, minimum years of experience,
   seniority, languages, and location or remote policy. Unstated fields
   are `null`, never guessed.
2. **Normalization (deterministic).** Skills are mapped to canonical
   names through `skill_alias`. Unmapped skills are kept as-is and
   flagged.
3. **Scoring (deterministic, pure function).**

   | Component                    | Weight |
   | ---------------------------- | ------ |
   | Required skills coverage     | 50     |
   | Preferred skills coverage    | 15     |
   | Experience vs. minimum years | 15     |
   | Language requirements        | 10     |
   | Location / remote fit        | 10     |
   - A component whose job requirement is unknown (`null`) is left out,
     and the remaining weights are renormalized to 100.
   - A requirement the job states but the candidate has no evidence for
     counts as a **gap**.
   - The result contains the total score, a per-component breakdown,
     the matched skills, the gaps, and `score_version`.

4. **Explanation (AI).** The model receives the score breakdown and
   writes an explanation of it. The explanation cannot change the score.

The scoring function is fully unit-tested without a language model.

### 10.3 AI Reliability

- AI output is validated before it is persisted.
- Job descriptions and CVs are untrusted input. They are passed as data
  and never treated as instructions.
- The AI never invents qualifications, achievements, or experience.
- "Unknown" is kept distinct from "missing".
- AI-generated SQL or code is never executed.
- Generated application materials require human review before use.

## 11. File Storage

### 11.1 Storage Port

```ts
interface StorageProvider {
  put(input: { key: string; body: Buffer; contentType: string }): Promise<{ key: string }>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}
```

### 11.2 Adapters

| Adapter      | Use                                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`      | Development and tests. Files are served only through an authorized route handler.                                                                                                         |
| `s3`         | AWS S3 or any S3-compatible service (Cloudflare R2, a local S3-compatible container). **Recommended for CVs and documents.**                                                              |
| `cloudinary` | Image assets such as profile photos. Supported for documents, but Cloudinary is media-oriented. Check the account's delivery settings for PDF and raw files before relying on it for CVs. |

### 11.3 Rules

- Object keys follow `users/{userId}/documents/{documentId}/{filename}`.
- Buckets and folders are private. Access uses short-lived signed URLs,
  issued only after an ownership check.
- File type is validated by content (magic bytes), not by extension.
- Allowed types: PDF, DOCX. Maximum size: 5 MB.
- Deleting a document removes both the database row and the stored
  object.

## 12. Job Sources

- **MVP:** the user pastes a job description or posting text. No
  scraping.
- **Post-MVP:** feeds are added as `JobSource` adapters that return a
  normalized job shape. Only public APIs whose terms allow the use are
  integrated.

## 13. Background Processing (Post-MVP)

All MVP operations run within a request: CV text extraction, requirement
extraction, matching, and explanation. Long AI calls stream or show
progress in the UI.

pg-boss is introduced when a concrete workload needs it, such as feed
synchronization, batch matching, or scheduled monitoring. It requires a
long-running worker process outside serverless functions. Background
jobs must be idempotent and must define retries, timeouts, and
execution status.

## 14. Security and Privacy

JobPilot processes personal career data and CVs. It is built to follow
the GDPR.

- Every protected request is authenticated.
- Every operation is authorized separately and checks record ownership
  on both reads and writes.
- Secrets live in environment variables and are never committed.
- Sessions and cookies use secure settings.
- Rate limits apply to AI endpoints and uploads.
- Credentials, CV contents, and unnecessary personal data are never
  logged.
- **Data subject rights:**
  - _Export:_ a user can download their profile, documents, and
    applications.
  - _Deletion:_ account deletion cascades to all domain rows and stored
    objects.
- **Data minimization:** only data needed for matching and tracking is
  collected.
- **Retention:** orphaned files and abandoned uploads are cleaned up.
- Explicit user approval is required before any consequential external
  action.

## 15. API and Validation

- Zod validates every boundary: request parameters, request bodies,
  form data, environment variables, external responses, and AI output.
- Errors use a consistent shape and correct status codes. Stack traces,
  internals, and secrets are never exposed.
- Transport concerns stay in the presentation or API layer. Business
  decisions stay in application and domain code.

## 16. Testing and Quality

| Level         | Scope                                                                                       | Phase           |
| ------------- | ------------------------------------------------------------------------------------------- | --------------- |
| Unit          | Scoring, skill normalization, status transitions, validation                                | MVP             |
| Integration   | Repositories, ownership checks, storage adapters (`local`), AI gateway with mocked provider | MVP             |
| AI evaluation | Fixture job descriptions: schema validity, extraction accuracy, grounded explanations       | MVP (small set) |
| End-to-end    | Sign-up, profile, job intake, match, tracking                                               | Stretch         |

- Unit tests never require a running language model.
- The AI evaluation suite runs on demand, and is re-run when a prompt,
  model, or provider changes.

## 17. Deployment and Operations

- **Local:** Docker Compose runs PostgreSQL and optionally an
  S3-compatible storage container. Ollama runs on the host.
- **Hosted demo:** the Next.js app runs on a serverless host with
  managed PostgreSQL, `STORAGE_PROVIDER=s3` or `cloudinary`, and
  `AI_PROVIDER=fixture` or `openai-compatible`.
- Migrations run as an explicit deploy step, never at application start.
- Production configuration must define secrets, backups, logging, and
  recovery.
- Local settings are never assumed to be suitable for production.
- Separate services are introduced only when scaling, isolation, or
  operational requirements justify them.

## 18. Roadmap

| Phase                       | Content                                                                   | Target  |
| --------------------------- | ------------------------------------------------------------------------- | ------- |
| 1. Foundation               | Tooling, env validation, auth, schema conventions, module layout, Vitest  | MVP     |
| 2. Profile and jobs         | Profile, skills, CV upload and storage adapters, job intake               | MVP     |
| 3. Matching                 | Extraction, normalization, scoring, explanation, eval fixtures, demo mode | MVP     |
| 4. Tracking                 | Application pipeline, notes, deadlines                                    | MVP     |
| 5. Materials and interviews | Tailored drafts, interview prep, document versions                        | Stretch |
| 6. Automation               | Job feeds, pg-boss, monitoring, notifications                             | Stretch |
| 7. Hardening                | E2E tests, observability, backups, retention jobs                         | Stretch |

These phases describe the intended direction, not completed
functionality.

## 19. Architecture Decisions

Significant decisions are recorded as ADRs in `docs/adr/`.

| ADR  | Decision                                                                         |
| ---- | -------------------------------------------------------------------------------- |
| 0001 | Modular monolith in a single package (no monorepo)                               |
| 0002 | Drizzle ORM instead of Prisma                                                    |
| 0003 | AI behind a gateway with swappable providers; Ollama locally                     |
| 0004 | Deterministic scoring separated from AI explanation                              |
| 0005 | Storage port with local, S3, and Cloudinary adapters; S3 preferred for documents |

### Changing a Major Decision

1. Check the current implementation.
2. Identify the requirement and the affected modules.
3. Evaluate simpler alternatives.
4. Record the decision and its trade-offs in a new ADR.
5. Update this document.
6. Add tests and verify the migration path.
