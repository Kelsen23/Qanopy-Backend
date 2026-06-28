# Repository Agent Policy

This file defines mandatory guidance for all agents working in this repository.

## Import Grouping

Keep imports in this order, with blank lines between groups:

1. External libraries
2. Shared types
3. Services
4. Configs
5. Utils
6. Models, queues, and other local modules

Keep related imports together inside each group. Prefer stable, readable ordering over micro-optimizing for line count.

## Controller / Service Boundaries

- Controllers handle HTTP only: request parsing, response status, JSON bodies, cookies, and route-level middleware expectations.
- Services handle behavior and business rules.
- Services should accept plain inputs and return plain outputs.
- Services should not depend on `Request` or `Response`.
- If the same service could be called from a CLI command or queue worker, the service boundary is clean.

## File Naming And Folder Structure

- Group code by feature first, then by layer.
- Use `src/controllers/<feature>.controller.ts` for HTTP handlers.
- Use `src/services/<feature>/` for feature services.
- Put shared helpers in the same feature folder when they are only used there.
- Keep cross-cutting helpers in `src/utils/`.
- Keep config access in `src/config/`.
- Prefer one meaningful service per file once a feature starts growing.

## Route Naming

- Use lowercase kebab-case for route paths.
- Prefer resource-oriented paths over action names.
- Keep route families grouped by prefix, such as `/auth/email/*`, `/auth/password/*`, and `/auth/oauth/*`.
- Use verbs only when the action is not naturally modeled as a resource update.

## Practical Rules

- controller -> service for business logic
- service -> utils for reusable low-level plumbing
- keep HTTP-specific code in the controller

## Code Review Severity Policy

For all code reviews in this repository, apply the following severity guidance unless a repo-specific instruction says otherwise:

- This repository is currently not in production and does not have existing production users or historical data compatibility requirements.
- Do not raise P1/P2 findings solely for missing database backfills or prefills for existing user data.
- Do not raise P1/P2 findings solely for breaking old clients after API, schema, or feature removal.
- Do not raise P1/P2 findings solely for compatibility with stale clients or historical data that cannot exist yet.

These cases may still be noted as comments, nits, or omitted entirely.

Still raise P1/P2 findings for security issues, real data loss, migration or runtime failures, CI or test failures, launch blockers, or any case where production users or data may exist.

If any AGENTS.md file states that the repo is in production or has compatibility requirements, follow that repo-specific instruction over this policy.
