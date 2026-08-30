# Architecture Context

## Stack

| Layer            | Technology              | Role                                                           |
| ---------------- | ----------------------- | -------------------------------------------------------------- |
| Framework        | Next.js 16 + TypeScript | Full-stack app with server/client boundaries                   |
| UI               | Tailwind + shadcn/ui    | Component composition and styling                              |
| Auth             | Clerk                   | User identity and route protection                             |
| Database         | Prisma + PostgreSQL     | Relational metadata: projects, collaborators, specs, task runs, AI provider configs |
| Canvas           | Liveblocks + React Flow | Real-time collaborative canvas, presence, and cursors          |
| Background tasks | Trigger.dev             | Durable AI generation workflows                                |
| AI providers     | Vercel AI SDK           | Provider-agnostic local and cloud model access                 |
| Artifact storage | Vercel Blob             | Canvas snapshots and generated Markdown specs                  |

## System Boundaries

- `app/api` — Authenticated request handlers: input validation, ownership checks, task triggering, and persistence.
- `trigger` — Long-running background jobs: AI design generation and spec generation.
- `lib` — Shared infrastructure: Prisma client, access control helpers, AI provider registry, encrypted provider config handling, schemas, and utilities.
- `components` — UI composition: canvas surfaces, sidebars, dialogs, and interactive elements.
- `prisma` — Database schema and generated client output.
- `data` — Legacy local directory. Not used for new artifacts.

## Storage Model

- **Database**: metadata, ownership, relationships, and task run records.
- **Vercel Blob**: generated artifacts — canvas snapshots at `canvas/{projectId}.json` and specs at `specs/{projectId}/{timestamp}-{uuid}.md`.
- Project records, spec records, and task run records belong in PostgreSQL.
- Project AI provider records store model metadata and encrypted credentials; the encryption key is supplied only through server/worker environment configuration.
- Canvas content and Markdown output are stored in and retrieved from Vercel Blob.
- The blob URL is stored in the database (`canvasBlobUrl`, `filePath`) as the reference to the artifact.

## Auth and Collaboration Model

- Every project has a single owner (Clerk user ID).
- Projects can include additional collaborators.
- Only authenticated users can access protected routes.
- Only the owner or a collaborator can mutate project resources.
- Only the project owner can create, edit, test, select, or delete provider configurations.
- Liveblocks room tokens are issued only after verifying project membership.

## Starter System Designs

- Prebuilt templates are static canvas snapshots stored in the codebase.
- Templates are loaded into the active Liveblocks room when a user imports one.
- Import can occur on canvas creation or from within the editor at any time.
- Template data follows the same node/edge schema as user-created canvas content.
- Templates do not require a separate database record; they are resolved by template ID at import time.

## AI Generation Model

### Design Generation

- Input: user prompt, project context, and current canvas state.
- Execution: durable background task via Trigger.dev.
- Model: selected server-side through `lib/ai-provider.ts`; local Ollama/LM Studio and cloud OpenAI, Anthropic, OpenRouter, or custom OpenAI-compatible endpoints are supported.
- Output: structured node and edge updates written into the shared Liveblocks room.

### Spec Generation

- Input: current canvas graph and project context.
- Execution: durable background task via Trigger.dev.
- Model: selected independently from design generation through `AI_SPEC_AGENT`/`AI_SPEC_MODEL` when configured.
- Output: Markdown technical spec saved to private Vercel Blob storage and linked to the project in the database.

## Invariants

1. Request handlers do not run long-lived AI work — that belongs in background tasks.
2. Metadata and large generated artifacts are stored in separate layers.
3. Auth and ownership are enforced at every mutation boundary.
4. Client components are used only where browser interactivity or real-time state requires them.
5. The canvas schema must remain consistent between user-created content and imported templates.
6. AI provider credentials and endpoint configuration remain server-side; task payloads contain no provider secrets.
7. Provider keys saved from the app are encrypted at rest and are never returned by API responses.
