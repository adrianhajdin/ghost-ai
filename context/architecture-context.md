# Architecture Context

## Stack

| Layer            | Technology              | Role                                                           |
| ---------------- | ----------------------- | -------------------------------------------------------------- |
| Framework        | Next.js 16 + TypeScript | Full-stack app with server/client boundaries                   |
| UI               | Tailwind + shadcn/ui    | Component composition and styling                              |
| Auth             | Internal auth           | User identity, server-side sessions, and route protection      |
| Database         | Prisma + PostgreSQL     | Relational metadata: projects, collaborators, specs, task runs |
| Canvas           | React Flow              | Permanent canvas renderer and interaction layer                |
| Realtime         | Internal WebSocket service | Collaboration runtime for room tokens, presence, canvas sync, chat/status events |
| Background tasks | Internal AI task runner | PostgreSQL-backed durable AI generation workflows              |
| AI providers     | Provider abstraction    | Mock, Google Gemini, and OpenAI-compatible design/spec generation |
| Email delivery   | Email provider abstraction | Local console delivery and SMTP account email delivery      |
| Artifact storage | Storage provider        | Canvas snapshots and generated Markdown specs                  |

## System Boundaries

- `app/api` — Authenticated request handlers: input validation, ownership checks, task triggering, read-only exports, and persistence.
- `lib/ai-tasks` — Long-running background jobs: task leasing, retries, AI design generation, and spec generation.
- `lib/ai/providers` — Server-side AI provider selection and external model adapters.
- `lib/ai/design` / `lib/ai/spec` — Provider contracts, structured design actions, and spec context helpers.
- `lib/canvas` — Canvas snapshot sanitization, CanvasDoc v1 compatibility helpers, semantic validation, and deterministic Design IR v1 compilation/export.
- `lib/prompt-pack` — Deterministic Prompt Pack v1 compilation from Design IR, target-specific Markdown rendering, stable IR hashing, and read-only project export helpers.
- `scripts/ai-worker.ts` — Worker process entrypoint for local and production task execution.
- `lib/email` — Server-only email provider selection and delivery for account emails.
- `lib/realtime` — Internal realtime foundation: signed room tokens, typed protocol, room registry, and WebSocket server.
- `scripts/realtime-server.ts` — Standalone realtime service entrypoint for long-lived WebSocket connections.
- `lib` — Shared infrastructure: Prisma client, access control helpers, and utilities.
- `components` — UI composition: canvas surfaces, sidebars, dialogs, and interactive elements.
- `prisma` — Database schema and generated client output.
- `data` — Legacy local directory. Not used for new artifacts.

## Storage Model

- **Database**: metadata, ownership, relationships, AI task runs/events/attempts, realtime room events, and project spec records.
- **Storage provider**: generated artifacts — the root canvas graph remains at `canvas/{projectId}.json`, service/internal graph documents are stored separately at `canvas/{projectId}/graphs/{graphId}.json`, and specs are stored at `specs/{projectId}/{specId}.md`.
- Project records, spec records, AI task run records, and internal realtime room events belong in PostgreSQL.
- Canvas content and Markdown output are stored in and retrieved from the configured artifact storage provider.
- Existing canvas storage remains compatible with `{ nodes, edges }` snapshots. New graph-aware canvas writes persist CanvasDoc v1 documents; legacy root reads normalize existing snapshots into `graph_root`, while subcanvas graphs are separate CanvasDoc v1 objects referenced by `node.data.subcanvasRef`.
- Design IR is machine-readable architecture. It is compiled on demand from the root CanvasDoc and directly linked child graph CanvasDocs, is exposed through a read-only project route, and is not persisted as an additional artifact by default.
- Prompt Packs are generated from Design IR. Prompt Packs are copy/download instruction artifacts only. Arc Forge does not execute Prompt Packs. Prompt Pack generation is deterministic, read-only, does not call AI providers, does not persist by default, and does not write back to repositories.
- Nimbus is not included as a Prompt Pack target in this version.
- Local development defaults to filesystem storage under `.local-storage`; external object storage such as Vercel Blob is optional.
- The database stores only the provider object reference in the existing `canvasBlobUrl` and `filePath` fields.

## Auth and Collaboration Model

- Every project has a single owner (`User.id` from the internal auth system).
- Internal sessions are verified server-side. Raw session tokens live only in httpOnly cookies; only hashed tokens are stored in PostgreSQL.
- Email verification and password reset tokens are single-use, expire, and are stored only as hashes.
- Account email delivery is provider-backed. Local development may use `EMAIL_PROVIDER=dev_console`; non-local SMTP delivery requires explicit SMTP configuration.
- Projects can include additional collaborators by normalized email address.
- Only authenticated users can access protected routes.
- Only the owner or a collaborator can mutate shared project resources.
- Owner-only project administration remains restricted to the owner.
- Internal realtime room tokens are short-lived, signed server-side, scoped to one project graph room, contain only minimal non-PII claims, and are issued only after verifying project membership. Graph-scoped room IDs use the project id plus graph id so root and service drill-down canvas updates do not collide.
- Long-lived WebSocket connections run in the standalone realtime service, not in Next.js route handlers.
- Local development may use HTTP/WS localhost URLs only when server-side `APP_ENV=local` and browser-facing `NEXT_PUBLIC_APP_ENV=local`; every non-local environment must use HTTPS/WSS and fail closed on insecure or missing public URLs.

## Starter System Designs

- Prebuilt templates are static canvas snapshots stored in the codebase.
- Templates are loaded into the active internal realtime canvas state when a user imports one.
- Import can occur on canvas creation or from within the editor at any time.
- Template data follows the same node/edge schema as user-created canvas content.
- Semantic templates seed typed node metadata for service, database, worker, and auth-module nodes while preserving the existing shape templates.
- Templates do not require a separate database record; they are resolved by template ID at import time.

## AI Generation Model

### Design Generation

- Input: user prompt, project context, and current canvas state.
- Execution: durable background task via the internal PostgreSQL-backed AI task runner.
- Provider: selected with `AI_PROVIDER=mock | google | openai_compatible`; local defaults to `mock` and requires no external key.
- Output: structured node and edge updates written to the active provider-backed canvas graph and published into the matching internal realtime room.
- Design provider output is validated against the allowed action schema before it can mutate canvas state.

### Spec Generation

- Input: current canvas graph and project context.
- Execution: durable background task via the internal PostgreSQL-backed AI task runner.
- Provider: selected through the same server-side AI provider factory.
- Output: Markdown technical spec saved through the storage provider and linked to the project in the database.

### Design IR Export

- Input: root `graph_root` CanvasDoc plus one level of child CanvasDocs referenced by root node `subcanvasRef.graphId`.
- Execution: deterministic in-process compiler, not AI.
- Output: read-only JSON export containing project defaults, graph hierarchy, typed semantic sections, relations, validation results, and provenance.
- Missing child graphs, unclassified items, missing required semantic fields, invalid graph IDs, relationship target issues, and raw secret redaction appear as advisory validation results. Export is not blocked.

### Prompt Pack Generation

- Input: Design IR v1 compiled from the project canvas graph scope.
- Execution: deterministic in-process renderer, not AI.
- Output: JSON and Markdown instruction artifacts for Codex, Claude Code, and Generic AI Builder targets.
- Prompt Packs include a stable hash of the source Design IR, architecture summaries, target-specific implementation guidance, warnings, assumptions, decisions, source references, forbidden choices, acceptance checks, validation checks, and final report requirements.
- Prompt Pack status is ready, has-warnings, or draft based on Design IR validation, unclassified items, missing child graphs, and missing required semantic fields.
- Raw secret-looking values remain redacted; `secretRef` and `secretCapabilityRef` references survive.

## Invariants

1. Request handlers do not run long-lived AI work — that belongs in background tasks.
2. Metadata and large generated artifacts are stored in separate layers.
3. Auth and ownership are enforced at every mutation boundary.
4. Client components are used only where browser interactivity or real-time state requires them.
5. The canvas schema must remain consistent between user-created content and imported templates.
6. AI workers lease queued tasks from PostgreSQL before execution; API routes only enqueue tasks after auth and project access checks.
7. Internal realtime WebSocket connections must use short-lived room tokens and must not expose raw auth/session tokens.
8. React Flow remains the permanent canvas renderer.
9. Non-local browser-facing HTTP and WebSocket transport must use HTTPS/WSS and fail closed when secure transport cannot be verified.
10. AI provider API keys are server-only and are required only when their provider is explicitly selected.
11. Email delivery secrets are server-only, and raw verification/reset tokens must never be stored in the database.
12. Durable canvas data must not include transient UI state such as selected, dragging, hovered, editing drafts, lasso rectangles, reconnect ghosts, or presence cursors.
13. Raw secret values must not be stored in canvas metadata or exported Design IR; use secretRef-style references only.
14. Prompt Pack generation must remain read-only: no AI calls, no code execution, no app builder runtime, no repository write-back, and no default persistence.
