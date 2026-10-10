# Module Boundaries

## Purpose

Define ownership and dependency rules before feature code begins to spread across the application.

## Ownership model

| Capability | Owns | Must not own |
|---|---|---|
| Identity | Sign-in, sessions, authorization primitives | Job matching or CV content generation |
| Candidate profile | Candidate facts, skills, preferences, work history | External job-source crawling |
| Jobs | Job records, source metadata, import and deduplication rules | Candidate document editing |
| Matching | Match criteria, scoring rules, skill-gap results | Session management or provider-specific HTTP clients |
| Documents | CV files, extracted content, document versions | Application status transitions |
| Applications | Application records, status history, deadlines, follow-ups | AI provider infrastructure |
| Interviews | Interview practice sessions, question sets, feedback | Candidate identity storage |
| Notifications | Delivery preferences and notification orchestration | Direct ownership of feature business rules |
| Analytics | Read-only aggregations and derived metrics | Authoritative writes to feature-owned records |

These are target boundaries. Create each module only when its functionality is implemented.

## Public interface

A substantial module should expose a narrow public API for the operations other modules need. Its internal domain, application, and persistence files remain private.

A recommended structure for a module that has enough complexity is:

```text
feature-name/
  domain/
  application/
  infrastructure/
  contracts/
  index.ts
```

Use a smaller structure for small features. Do not add empty layers.

## Dependency rules

1. Cross-module imports must go through the owning module's public entry point.
2. Do not import another module's repository, database model, private schema, or internal helper.
3. Do not call external providers from domain rules.
4. Keep React components and Next.js APIs out of business rules.
5. Keep authorization close to use cases and verify ownership for every record-level operation.
6. Shared code must be generic and justified by more than one concrete use case.
7. Avoid circular dependencies. If two modules need each other, extract a small shared contract or redesign ownership.
8. Prefer explicit input and output types. Validate untrusted runtime input with Zod at system boundaries.

## Adding a module

Before creating a module, document:

- The business capability and owner.
- The public operations other modules need.
- Data it owns and records it references.
- The dependencies it can call.
- Authorization requirements.
- Failure modes and side effects.
- Tests required for its business rules and boundaries.

A module is ready when its behavior is implemented, tests cover important rules, dependencies respect these boundaries, and documentation matches the code.
