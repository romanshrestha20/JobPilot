# Development Workflow

## Before changes

1. Read `AGENTS.md` and the relevant architecture documentation.
2. Inspect current code, package scripts, dependencies, and configuration.
3. Identify the owning module and public contract.
4. Check whether shared infrastructure already supports the requirement.
5. Make the smallest complete change.

## Current commands

The package currently defines:

- `pnpm dev`: start the development server.
- `pnpm build`: create a production build.
- `pnpm start`: start the built application.
- `pnpm lint`: run ESLint.

Do not document a command as available until it exists in `package.json`.

## Completion checks

For the affected change:

1. Run the applicable lint command.
2. Run type checking when a typecheck script or an equivalent command is configured.
3. Run relevant unit, integration, or end-to-end tests when configured.
4. Build the application for significant route, configuration, or framework changes.
5. Review the final diff and verify that no secrets or unrelated changes were added.
6. Update docs and environment examples as needed.
7. Report checks that could not be run.

## Change strategy

- Prefer focused commits and small pull requests.
- Do not make broad dependency or framework upgrades as part of feature work without a clear reason.
- Add an architecture decision record when a choice changes a core technology, persistence strategy, public contract, or operational model.
- Use migrations for schema changes.
- Never rely on external AI responses to make a deterministic test pass.
- Require explicit user approval for consequential actions such as sending messages or submitting applications.
