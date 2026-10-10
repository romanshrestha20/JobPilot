# JobPilot Architecture

## Status

This document describes the current architectural direction and distinguishes existing code from planned capabilities. Do not treat a proposed module or dependency as implemented until it exists in the repository and has tests.

## Current implementation

The repository currently contains a Next.js App Router application written in TypeScript, Tailwind CSS, ESLint, Prettier, and Zod-based environment validation.

The current package scripts are:

- `pnpm dev`
- `pnpm build`
- `pnpm start`
- `pnpm lint`

The current dependency manifest does not yet include Prisma, PostgreSQL client tooling, Vitest, Playwright, or Inngest. The environment schema anticipates database and Ollama configuration, but configuration alone does not mean those integrations are implemented.

## Architectural approach

JobPilot will use a modular monolith. Keep one deployable application while organizing business capabilities around explicit module boundaries. Introduce separate services only when a measurable operational need justifies them.

### Layers

1. **Presentation**: Next.js pages, layouts, UI components, and route handlers.
2. **Feature modules**: domain rules and application use cases for an owned career capability.
3. **Shared infrastructure**: database access, authentication, AI gateway, file storage, job scheduling, logging, and configuration.
4. **External adapters**: job providers, AI model providers, and notification services.
5. **Quality**: unit and integration tests, end-to-end tests, AI evaluations, and operational checks.

### Dependency direction

- Presentation delegates business actions to application use cases.
- Feature modules depend on documented public contracts, not private implementation details of other features.
- Domain rules must not depend on Next.js, a specific database client, or a specific AI provider.
- Infrastructure adapters implement narrow contracts and can be replaced without rewriting domain logic.
- Shared infrastructure must remain generic. Feature-specific rules belong to the owning feature.
- Avoid circular dependencies and speculative abstractions.

## Planned feature boundaries

The following are proposed capabilities, not current implementation claims:

- Identity and access.
- Candidate profile.
- Job discovery and job source adapters.
- Job matching and skill-gap analysis.
- CV and document management.
- Application tracking.
- Interview preparation.
- Notifications and scheduled automation.
- Career analytics.

Create a module when a feature has real behavior to own. Do not create empty folders just to match the roadmap.

## Shared platform contracts

New infrastructure should be introduced behind a stable, typed contract when at least one of these conditions holds:

- Multiple modules need the capability.
- The provider may change.
- Deterministic tests need to replace the external system.
- Security or authorization requires a centralized enforcement point.

Each contract should document inputs, outputs, expected failures, timeouts, authorization responsibilities, and test strategy.

## Configuration

Environment configuration is validated in `env.ts` with Zod. Keep `.env.example` aligned with the schema. Do not expose secrets to client components or commit real credentials.

Optional integrations should remain optional until a feature actually needs them. Required configuration should fail with a clear message and should be loaded from server-only code.

## Incremental implementation

Implement in small slices:

1. Reliable app shell, configuration examples, and quality commands.
2. Persistence schema and migration workflow.
3. Identity and record ownership.
4. Candidate profile.
5. Job records and source metadata.
6. Matching and AI gateway.
7. Documents and application tracking.
8. Interview preparation, automation, analytics, and production operations.

Do not proceed to an integration just because its configuration variable has been added. Establish its contract, implementation, tests, and operational requirements first.
