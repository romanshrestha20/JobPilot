# JobPilot

AI-assisted career management and job search platform.

JobPilot is intended to help candidates discover relevant opportunities, understand role fit, prepare application materials, track applications, and practice for interviews. It is in early development. The roadmap below is a plan, not a list of already implemented features.

## Current status

The repository currently contains a Next.js App Router application using TypeScript, Tailwind CSS, Zod environment validation, ESLint, and Prettier. The root page is an early product overview and roadmap.

The repository does not yet contain an implemented database layer, authentication flow, job-search integration, AI generation workflow, or application tracking system. Add these capabilities incrementally with tests and documented boundaries.

## Architecture principles

- Use a modular monolith while the product and domain boundaries mature.
- Keep business rules inside the feature that owns them.
- Make cross-feature dependencies go through public contracts.
- Keep UI and route handlers thin.
- Centralize database, authentication, storage, AI, and background-workflow infrastructure.
- Validate untrusted input and AI output.
- Protect CVs, application data, and personal information.
- Keep AI-generated materials editable and subject to user review.
- Require explicit approval before consequential external actions.

Read [AGENTS.md](./AGENTS.md) before making code changes. See [the architecture overview](./docs/architecture.md), [module boundaries](./docs/module-boundaries.md), [development workflow](./docs/development-workflow.md), and [ADR 0001](./docs/decisions/0001-modular-monolith.md).

## Technology currently configured

| Area | Current configuration |
|---|---|
| Web app | Next.js App Router |
| Language | TypeScript |
| Package manager | pnpm 11 |
| UI | Tailwind CSS |
| Runtime validation | Zod |
| Linting | ESLint |
| Formatting | Prettier |
| AI | Ollama is planned through the existing environment schema, client integration is not yet implemented |
| Database | PostgreSQL and Prisma are planned, persistence is not yet implemented |
| Tests | Test framework scripts are not yet configured |

The actual `package.json` is the source of truth for installed dependencies and commands.

## Requirements

- Node.js compatible with the installed Next.js version.
- pnpm 11.18.0, as declared by the package manifest.
- Docker and Ollama are only needed when the corresponding infrastructure is introduced or used locally.

## Local setup

Clone the repository:

```bash
git clone https://github.com/romanshrestha20/jobpilot.git
cd jobpilot
```

Install dependencies:

```bash
pnpm install
```

Create your local environment file:

```bash
cp .env.example .env
```

Edit `.env` with local values. The current `env.ts` schema requires `DATABASE_URL`, `LLM_MODEL`, and an `AUTH_SECRET` with at least 32 characters when that module is loaded. The database and AI integrations are not yet implemented. Do not use the example secret in a deployed environment.

Run the current scripts:

```bash
pnpm dev
pnpm lint
pnpm build
```

Use separate terminal sessions for commands that need to run at the same time. The site URL is printed by Next.js after the development server starts.

## Current scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Start Next.js in development |
| `pnpm build` | Build for production |
| `pnpm start` | Serve the production build |
| `pnpm lint` | Run ESLint |

Commands such as database migrations, tests, workers, and AI evaluations will be added only with their corresponding tooling.

## Roadmap

1. Foundation: modular boundaries, reliable configuration, data access, authentication, and quality checks.
2. Job discovery: job search, filters, source metadata, saved roles, imports, and duplicate detection.
3. Career assistant: candidate profile, CV extraction, explainable matching, skill-gap insights, and reviewable AI drafts.
4. Application management: statuses, deadlines, notes, document versions, and follow-ups.
5. Interview preparation: job-specific questions, mock practice, and feedback history.
6. Automation: scheduled job monitoring, background processing, and approval-based notifications.
7. Analytics: application outcomes, search activity, and skill-gap trends.
8. Production readiness: security, performance, monitoring, backups, deployment, and privacy controls.

## Contributing

1. Read `AGENTS.md` and the relevant docs.
2. Inspect existing code and scripts before choosing a pattern.
3. Make a focused change within the feature's ownership boundary.
4. Add tests for business rules and critical failure paths when test tooling is available.
5. Run configured quality checks and report any checks that could not run.
6. Update documentation alongside behavior or configuration changes.
7. Review the final diff for accidental changes and secrets.

## Security

Never commit `.env`, credentials, access tokens, or real candidate documents. Treat imported job content and model output as untrusted data. Do not log CV contents or sensitive personal information. See [AGENTS.md](./AGENTS.md) for the required development and security rules.
