# ADR 0001: Use a Modular Monolith

- Status: Accepted
- Date: 2026-10-10

## Context

JobPilot is expected to support several related career workflows, including candidate profiles, job discovery, matching, document preparation, application tracking, and interview practice. These workflows share identity, persistence, AI integration, and privacy requirements. Implementing separate services at the start would introduce deployment and operational complexity before the boundaries are proven.

## Decision

Use a modular monolith as the default architecture. Group business logic by feature. Keep infrastructure behind shared, typed contracts. Maintain explicit public interfaces between modules.

## Consequences

### Positive

- One application is easier to develop and deploy during early stages.
- Feature ownership is clearer than a single undifferentiated codebase.
- Shared services can enforce consistent security and validation.
- Modules can be tested with focused unit tests and mocked infrastructure.
- The system retains room to extract a service later if evidence supports it.

### Trade-offs

- Module boundaries must be enforced through code review, lint rules, and tests.
- A single deployment does not provide independent scaling for every capability.
- Shared infrastructure can become a bottleneck if it is not kept generic and reliable.

## Follow-up

Introduce enforcement and integrations incrementally. Do not create placeholder modules or microservices just to represent future roadmap items.
