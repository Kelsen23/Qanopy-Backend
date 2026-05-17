---
name: style
description: Lightweight repository style checklist for import grouping, controller/service boundaries, route naming, and folder structure.
---

# Style Checklist

Use this skill as an execution checklist when working in this repo.

## Imports

- Group imports in this order: external libraries, shared types, services, configs, utils, then models/queues/other local modules.
- Separate groups with blank lines.
- Keep imports stable and readable.

## Boundaries

- Keep HTTP concerns in controllers.
- Keep business logic in services.
- Services should take plain inputs and return plain outputs.
- Do not couple services to `Request` or `Response`.

## Structure

- Organize code by feature first, then by layer.
- Put controllers in `src/controllers/<feature>.controller.ts`.
- Put feature services in `src/services/<feature>/`.
- Keep shared feature helpers alongside that feature.
- Put cross-cutting helpers in `src/utils/`.
- Put config access in `src/config/`.
- Prefer one meaningful service per file as the feature grows.

## Routes

- Use lowercase kebab-case route paths.
- Prefer resource-oriented names.
- Group route families by prefix, such as `/auth/email/*`, `/auth/password/*`, and `/auth/oauth/*`.
- Use verbs only when the action is not naturally modeled as a resource update.

## Rule Of Thumb

- Move business logic from controller to service.
- Move reusable plumbing from service to utils.
- Keep HTTP-specific code in the controller.
