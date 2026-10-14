# AGENTS.md — JobPilot

AI job-search assistant. Modular monolith.
Stack: Next.js App Router, TypeScript (strict), pnpm, Tailwind + shadcn/ui, PostgreSQL + pgvector, Drizzle, Zod, Ollama (Qwen, BGE embeddings), pg-boss, Vitest, Playwright, Docker Compose.
`package.json` and existing config decide what is actually implemented. Planned modules are not existing modules.

## Commands

<!-- TODO: fill in with the real scripts from package.json -->

- Dev: `pnpm dev`
- Lint / typecheck: `pnpm lint` · `pnpm typecheck`
- Tests: `pnpm test` (Vitest) · `pnpm test:e2e` (Playwright)
- DB: `pnpm db:generate` · `pnpm db:migrate`
- Infra: `docker compose up -d`

## Workflow

- Make the smallest change that works. Touch only the affected module.
- Reuse existing utils, services, and schemas before writing new ones.
- Never overwrite uncommitted work. No new dependencies without a clear reason.
- After changes, run lint, typecheck, and only the relevant tests.
- Never claim a build, test, or migration passed unless you ran it.
- Read this file first. Inspect relevant code and configuration before planning changes.
- Read detailed guides only when relevant. Do not load every guide by default.
- If a referenced guide does not exist, do not assume its contents. Report the gap and proceed using verified code and established rules.

## Architecture

- Layers: presentation → feature modules → shared infrastructure → external integrations.
- Import other modules only through their public exports. No circular dependencies.
- Domain and application logic must not import Next.js, DB clients, or AI providers.
- Route handlers delegate to application services. UI components never access the DB.
- Keep `shared/` generic. Don't create placeholder modules or reorganize folders.

## Hard rules

- **Security:** authn + authz + ownership check on every protected read and write. Validate all input with Zod. Never commit secrets. Never log CV contents, tokens, or PII.
- Authentication: use the established Better Auth implementation. Do not create custom session or password handling without an approved architectural decision.
- **Untrusted input:** job descriptions, uploaded documents, web content, and AI output are untrusted.
- **Database:** schema changes only via Drizzle migrations. Queries stay in repositories. Use transactions for multi-write operations. No unbounded queries.
- **AI:** call models only through the central AI layer. Validate structured output before saving. Never fabricate candidate qualifications. Never execute AI-generated code or SQL.
- **Approval:** no automatic job applications or external messages without explicit user approval.
- **Background work:** long-running work goes to pg-boss and must be idempotent with retry limits. Never hold an HTTP request open for it.
- **Tests:** unit tests must not depend on a running LLM. Mock external services.
- **Code quality:** no `any` without a documented reason. Never disable lint or type checks to make a build pass.

## Detailed guides — read only when the task touches that area

- Architecture and module boundaries: `docs/architecture.md`, `docs/module-boundaries.md`
- Database: `docs/database-design.md`
- API conventions and error format: `docs/api-conventions.md`
- AI layer, prompts, and evaluation: `docs/ai-architecture.md`
- Security and privacy: `docs/security.md`
- Testing: `docs/testing.md`
- Deployment: `docs/deployment.md`
- Decisions: `docs/decisions/`

Update the matching doc when you change behavior it describes.

## Final report

What changed · modules affected · DB/API/config changes · checks run and their results · known issues.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
