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
