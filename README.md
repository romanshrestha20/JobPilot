# JobPilot

AI-powered career management and job search platform.

JobPilot helps candidates discover relevant jobs, understand their suitability, prepare tailored application materials, manage applications, and prepare for interviews.

The project is designed as a modular monolith with a shared platform foundation. New capabilities should reuse established infrastructure instead of introducing duplicate implementations.

## Vision

Build a personal AI career assistant that makes job searching more organized, targeted, and efficient.

JobPilot aims to bring the main stages of a job search into one workflow:

1. Discover relevant opportunities.
2. Understand job requirements.
3. Evaluate compatibility with a candidate profile.
4. Generate and review tailored application materials.
5. Track applications and deadlines.
6. Prepare for interviews.
7. Analyze progress and improve future applications.

## Core Principles

- Modular architecture with explicit module boundaries.
- Reusable platform infrastructure.
- Type-safe development and runtime validation.
- Secure handling of candidate information and documents.
- AI-assisted workflows with human review.
- Testable business logic.
- Local AI inference support through Ollama.
- Incremental delivery with production-quality engineering practices.

## Technology Stack

| Area                       | Technology                         |
| -------------------------- | ---------------------------------- |
| Web application            | Next.js App Router                 |
| Language                   | TypeScript                         |
| Package manager            | pnpm                               |
| UI                         | Tailwind CSS and shadcn/ui         |
| Database                   | PostgreSQL                         |
| Vector search              | pgvector                           |
| ORM and migrations         | Prisma                             |
| Validation                 | Zod                                |
| Local AI inference         | Ollama                             |
| AI models                  | Qwen and suitable embedding models |
| Background workflows       | Inngest                            |
| Unit and integration tests | Vitest                             |
| End-to-end tests           | Playwright                         |
| Local infrastructure       | Docker Compose                     |

The repository's actual package configuration determines which components are currently installed and operational.

## Architecture

JobPilot uses a modular monolith rather than separate microservices for each feature.

The main architectural areas are:

- Presentation layer: pages, layouts, components, and HTTP endpoints.
- Feature modules: candidate profiles, jobs, matching, documents, applications, interviews, notifications, and analytics.
- Infrastructure: database access, authentication, AI providers, storage, background jobs, configuration, and observability.
- Testing and evaluation: unit tests, integration tests, end-to-end tests, and AI quality evaluations.

Feature modules own their business logic and expose documented public interfaces. Shared infrastructure provides reusable technical capabilities.

The architecture should allow new features to be introduced without rewriting unrelated modules.

See `docs/architecture.md` and `docs/module-boundaries.md` for detailed design decisions.

## Current Development Status

JobPilot is under active development.

The project direction includes the candidate profile, job management, preliminary job matching, and dashboard workflows. The AI extraction and validation pipeline, along with other planned capabilities, must be verified against the current implementation before being described as complete.

Consult the source code, tests, and project documentation for the authoritative implementation status.

## Getting Started

### Prerequisites

Install the following tools:

- Git
- Node.js version supported by the repository
- pnpm
- Docker and Docker Compose
- Ollama, if you want to run local AI models

Check the versions required by the project before changing your local environment.

### 1. Clone the repository

```bash
git clone <YOUR_JOBPILOT_REPOSITORY_URL>
cd jobpilot
```

Replace the placeholder with the actual repository URL.

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Populate the required values in `.env`.

Never commit real credentials or a populated environment file.

### 4. Start local infrastructure

```bash
docker compose up -d
```

Review the Compose configuration to confirm which services are defined and which ports they use.

### 5. Prepare the database

Run the repository's configured database generation and migration commands:

```bash
pnpm db:generate
pnpm db:migrate
```

Run the seed command if the project provides seed data:

```bash
pnpm db:seed
```

Review the Prisma schema and migration documentation before applying changes to any shared or production database.

### 6. Start the application

```bash
pnpm dev
```

Use the local URL printed by Next.js.

### 7. Start background processing

If background workflows are configured, start the development worker in a separate terminal:

```bash
pnpm worker
```

### 8. Configure local AI

Install and start Ollama separately if it is not already running.

Pull a model appropriate for your machine and the tasks being tested. Configure the model name and service URL through the documented environment variables.

Verify the connection before testing AI-dependent features.

Local AI is an optional development dependency for workflows that do not require inference.

## Development Commands

The following commands describe the intended project workflow. Verify their availability in `package.json` before relying on them.

| Command            | Purpose                                 |
| ------------------ | --------------------------------------- |
| `pnpm dev`         | Start the Next.js development server    |
| `pnpm worker`      | Start background job processing         |
| `pnpm lint`        | Run linting, if configured              |
| `pnpm typecheck`   | Run TypeScript checks, if configured    |
| `pnpm test`        | Run unit and integration tests          |
| `pnpm test:e2e`    | Run Playwright end-to-end tests         |
| `pnpm eval`        | Run AI evaluation tests                 |
| `pnpm db:generate` | Generate Prisma Client                  |
| `pnpm db:migrate`  | Apply configured development migrations |
| `pnpm db:seed`     | Seed the development database           |

Do not assume an optional script exists until it has been checked in `package.json`.

## Project Structure

The following is the intended organizational model. Directory names should match the actual repository.

```text
jobpilot/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   ├── (dashboard)/
│   │   └── api/
│   ├── modules/
│   │   ├── identity/
│   │   ├── candidates/
│   │   ├── jobs/
│   │   ├── matching/
│   │   ├── documents/
│   │   ├── applications/
│   │   ├── interviews/
│   │   ├── notifications/
│   │   └── analytics/
│   ├── server/
│   │   ├── db/
│   │   ├── ai/
│   │   ├── queue/
│   │   ├── storage/
│   │   └── security/
│   └── components/
├── prisma/
│   └── schema.prisma
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── architecture.md
│   ├── module-boundaries.md
│   ├── database-design.md
│   ├── api-conventions.md
│   ├── ai-architecture.md
│   ├── security.md
│   ├── testing.md
│   ├── deployment.md
│   └── decisions/
├── AGENTS.md
├── .env.example
├── docker-compose.yml
├── package.json
└── pnpm-lock.yaml
```

Do not create or move directories solely to match this illustration. Preserve the established repository structure and document intentional architectural changes.

## Development Roadmap

### Phase 1. Foundation

- Project configuration and developer tooling.
- Authentication and authorization.
- Database conventions and migrations.
- Modular architecture and dependency boundaries.
- Testing and CI.
- Documentation and local infrastructure.

### Phase 2. Job Discovery

- Job search and filtering.
- Job details and source metadata.
- Saved jobs.
- Duplicate detection.
- Supported job imports.

### Phase 3. AI Career Assistant

- CV upload and extraction.
- Candidate profile analysis.
- Job suitability scoring.
- Skill-gap analysis.
- Tailored CV and cover letter generation.
- Structured AI outputs and evaluations.

### Phase 4. Application Management

- Application status tracking.
- Document version history.
- Deadlines and follow-ups.
- Notes and application history.
- Career dashboard.

### Phase 5. Interview Preparation

- Job-specific interview questions.
- Mock interviews.
- Technical and behavioral practice.
- Feedback and progress tracking.

### Phase 6. Automation

- Scheduled job monitoring.
- New opportunity alerts.
- Background document processing.
- AI-assisted application preparation.
- Approval-controlled external actions.

### Phase 7. Analytics

- Application conversion metrics.
- Job search activity reports.
- Skill-gap trends.
- Personalized recommendations.

### Phase 8. Production Readiness

- Security hardening.
- Performance testing.
- Monitoring and error reporting.
- Backup and recovery.
- Deployment automation.
- Privacy and data lifecycle controls.

These phases describe the intended roadmap, not a guarantee that the features are already implemented.

## Architecture Rules

Every contributor must read `AGENTS.md` before making changes.

Key rules:

- Keep business logic inside feature modules.
- Expose public interfaces rather than importing private module internals.
- Keep database access out of UI components and HTTP handlers.
- Use the shared AI gateway rather than calling AI providers directly.
- Validate external input and AI output.
- Protect candidate data through authentication, authorization, and ownership checks.
- Use migrations for database changes.
- Add tests and update documentation with each relevant feature.
- Preserve backward compatibility unless a breaking change is intentional and documented.

## Testing and Quality

Before submitting changes, run the relevant configured checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

For end-to-end or AI-dependent changes, also run:

```bash
pnpm test:e2e
pnpm eval
```

Some checks may require additional infrastructure or may not yet be configured. Confirm actual script availability and document any checks that could not be completed.

## Security and Privacy

JobPilot may process CVs, employment history, contact information, application documents, and other personal data.

The application must:

- Restrict access to authorized users.
- Avoid exposing sensitive information in logs.
- Store secrets outside source control.
- Validate file uploads and protect document access.
- Treat imported content as untrusted.
- Apply data retention and deletion policies.
- Require approval for consequential external actions.

See `docs/security.md` for the detailed security model.

## Documentation

| Document                    | Purpose                                        |
| --------------------------- | ---------------------------------------------- |
| `AGENTS.md`                 | Mandatory coding-agent rules                   |
| `docs/architecture.md`      | System architecture and boundaries             |
| `docs/module-boundaries.md` | Module ownership and dependencies              |
| `docs/database-design.md`   | Database conventions and relationships         |
| `docs/api-conventions.md`   | API design and error handling                  |
| `docs/ai-architecture.md`   | AI gateway, providers, prompts, and evaluation |
| `docs/security.md`          | Security and privacy requirements              |
| `docs/testing.md`           | Testing strategy and commands                  |
| `docs/deployment.md`        | Deployment and operations                      |
| `docs/decisions/`           | Architecture decision records                  |

Create missing documents when their associated architecture or functionality is implemented. Do not link to nonexistent documentation as if it were complete.

## Contributing

1. Read `AGENTS.md`.
2. Inspect the relevant module and its public interfaces.
3. Make a focused change.
4. Add or update tests.
5. Run relevant quality checks.
6. Update documentation.
7. Review the final diff and report outstanding limitations.

## Project Goal

JobPilot should remain easy to extend as new career tools, AI providers, integrations, and automation workflows are introduced.

Every new capability should build on the shared foundation, respect module boundaries, and preserve the reliability and security of existing functionality.
