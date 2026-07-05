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
| AI providers     | Provider abstraction    | Mock, Google Gemini, and OpenAI-compatible spec/draft/prompt-pack/architect generation |
| Email delivery   | Email provider abstraction | Local console delivery and SMTP account email delivery      |
| Artifact storage | Storage provider        | Canvas snapshots and generated Markdown specs                  |

## System Boundaries

- `app/api` — Authenticated request handlers: input validation, ownership checks, task triggering, read-only exports, and persistence.
- `lib/ai-tasks` — Long-running background jobs: task leasing, retries, spec generation, architecture drafts, LLM Prompt Pack generation, and Architect conversation.
- `lib/ai/providers` — Server-side AI provider selection and external model adapters.
- `lib/ai/spec` / `lib/ai/architecture-draft` / `lib/ai/prompt-pack` / `lib/ai/architect` — Provider contracts for specs, architecture draft proposals, LLM Prompt Pack requests, and Architect conversation replies.
- `lib/architecture-draft` — Pure Architecture Draft v1 schema, validator, sanitizer, CanvasDoc append-only apply helper, collision resolution, and smoke-testable proposal utilities.
- `lib/canvas` — Canvas snapshot sanitization, CanvasDoc v1 compatibility helpers, semantic validation, deterministic Design IR v1 compilation/export, sanitized canvas pyramid transport for LLM Prompt Packs and Architect, and generic LLM canvas patch apply mechanics.
- `lib/prompt-pack` — LLM Prompt Pack v1 transport schema and mechanical Markdown/JSON export of LLM-authored output.
- `scripts/ai-worker.ts` — Worker process entrypoint for local and production task execution.
- `lib/email` — Server-only email provider selection and delivery for account emails.
- `lib/realtime` — Internal realtime foundation: signed room tokens, typed protocol, room registry, and WebSocket server.
- `scripts/realtime-server.ts` — Standalone realtime service entrypoint for long-lived WebSocket connections.
- `lib` — Shared infrastructure: Prisma client, access control helpers, and utilities.
- `components` — UI composition: canvas surfaces, sidebars, dialogs, and interactive elements.
- `prisma` — Database schema and generated client output.
- `data` — Legacy local directory. Not used for new artifacts.

## Canvas v2 Guardrails

- React Flow remains the canvas renderer and CanvasDoc JSON remains the durable source of truth for root and child graphs.
- The graph model is a layered architecture pyramid: `graph_root` is the system/root architecture view, child graphs are internals of any selected node, and deeper graphs are progressively more detailed decomposition.
- Any node may have `subcanvasRef`. Deterministic code must not restrict child-layer creation/opening by semantic type, shape, label, or perceived architectural importance.
- Node type may choose starter suggestions and metadata defaults only. It is never a permission model for drill-down.
- Architect is the architecture reasoning layer. It receives the sanitized CanvasDoc pyramid, current graph id, selected node ids, provider metadata, project-wide messages, and graph provenance, and it may propose safe cross-layer patches for user approval.
- Deterministic code may validate JSON shape, graph/node/edge id safety, raw-secret and transient-state rules, unsupported destructive operations, auth/access, storage, preview/apply mechanics, and export/download.
- Deterministic code must not generate architecture, judge architecture quality, author Prompt Pack content, block child layers by node type, or block Prompt Pack generation because metadata is incomplete.
- Semantic Scan is advisory for architecture completeness. It may only block/fail for safety, transport, schema, malformed patch, raw secret, transient UI state, invalid ids, unsupported destructive operations, or auth/access violations.
- Prompt Packs are LLM-authored from sanitized CanvasDoc pyramid JSON. Deterministic code may mechanically render/export that output but must not provide a deterministic prompt-authoring fallback.
- Arc Forge must not become a full UML/BPMN/ArchiMate clone, cloud vendor mega-palette, code execution environment, app builder, external repo writer, target-app PR creator, or deployment system.
- Nimbus, image/multimodal input, auto-apply patches, and multiple AI editing personas are not active Canvas v2 behavior.

### Canvas v2 Phase 1 Semantic Foundation

- The semantic taxonomy version is `2.0.0`.
- Default root node types: actor, client-surface, service, worker, database, event-channel, external-system, identity-auth, and generic-component.
- Advanced root node types: cache-store and object-store.
- Internal child-layer node types: api, domain-model, entity, endpoint-group, endpoint, event-contract, business-rule, validation-rule, policy, and spec-note.
- Legacy aliases normalize as compatibility metadata: frontend maps to client-surface, queue maps to event-channel, cache maps to cache-store, and auth-module maps to identity-auth. Unknown/custom semantic types load as generic-component while preserving originalSemanticType, architectureType, and LLM semantic metadata where present.
- Default relationship types are interacts_with, calls, reads, writes, publishes, consumes, authenticates_via, and runs_on. Advanced relationship types are triggers, monitors, depends_on, and syncs_with. Legacy edge semantic aliases normalize into relationshipType while label and labelItems remain preserved.
- Durable node metadata may include responsibilities, maturity, boundary, layerRole, interfaces exposed/consumed, data owned/read, events emitted/consumed, technology, runtime kind, security/privacy notes, operational notes, open questions, and Prompt Pack notes. Durable edge metadata may include mechanism, protocol, data/event subject, sync mode, security notes, and trust notes.

### Canvas v2 Phase 2 Inspector, Scan, And Layer Summaries

- The node and edge inspector exposes durable architecture metadata through progressive sections rather than one flat form. Node sections cover overview, interfaces, data, events, security, operations, Prompt Pack notes, open questions, and child layer state. Edge sections cover overview, mechanism, data/events, security/trust, and notes.
- Semantic Scan v2 emits categorized findings for relationship clarity, topology quality, state ownership, async integrity, security integration, operability, AI governance, and safety. Incomplete architecture metadata remains advisory; raw secrets, unsafe transport, malformed schema, auth/session risks, and unsupported destructive operations remain blocking.
- Per-graph scan panel state is stored in CanvasDoc `panels.semanticScan` so snoozed or intentional advisory findings survive reloads without becoming global project state.
- Child CanvasDocs update parent node metadata with `hasChildLayer`, `childLayerPurpose`, `childLayerSummary`, `decompositionStatus`, `lastLayerSummary`, and `childLayerUpdatedAt`. This metadata is refreshed when child graphs are created, populated by LLM patch apply, or saved through the canvas route.
- The sanitized CanvasDoc pyramid includes compact `metadataSummary` records for every node and edge plus each graph's `semanticScan` summary. These summaries are LLM context, not deterministic prompt authoring.

## Storage Model

- **Database**: metadata, ownership, relationships, AI task runs/events/attempts, realtime room events, Architect conversation messages, and project spec records.
- **Storage provider**: generated artifacts — the root canvas graph remains at `canvas/{projectId}.json`, child architecture layer graph documents are stored separately at `canvas/{projectId}/graphs/{graphId}.json`, and specs are stored at `specs/{projectId}/{specId}.md`.
- Project records, spec records, AI task run records, and internal realtime room events belong in PostgreSQL.
- Canvas content and Markdown output are stored in and retrieved from the configured artifact storage provider.
- Existing canvas storage remains compatible with `{ nodes, edges }` snapshots. New graph-aware canvas writes persist CanvasDoc v1 documents; legacy root reads normalize existing snapshots into `graph_root`, while child layer graphs are separate CanvasDoc v1 objects referenced by `node.data.subcanvasRef`.
- CanvasDoc `panels` stores non-graph panel state such as per-graph Semantic Scan snooze/intentional finding ids. Panel state is sanitized with the same raw-secret stripping rules as other CanvasDoc metadata.
- Design IR is machine-readable architecture. It is compiled on demand from the root CanvasDoc and recursively linked child graph CanvasDocs where available, is exposed through a read-only project route, and is not persisted as an additional artifact by default.
- Prompt Packs are generated by the LLM directly from sanitized CanvasDoc pyramid JSON. Prompt Packs are copy/download instruction artifacts only. Arc Forge does not execute Prompt Packs, build generated apps, or write back to repositories. The Prompt Pack flow uses the AI task runner and provider abstraction; there is no non-LLM Prompt Pack generator, route, or fallback.
- Architect conversation messages are stored as one project-wide thread in PostgreSQL, with each message retaining graphId provenance for the layer where it was sent. The thread is scoped by project access, sanitized before persistence, and kept separate from collaborator Chat.
- Nimbus is not included yet and is not a Prompt Pack target in this version.
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
- Internal realtime room tokens are short-lived, signed server-side, scoped to one project graph room, contain only minimal non-PII claims, and are issued only after verifying project membership. Graph-scoped room IDs use the project id plus graph id so root and child layer canvas updates do not collide.
- Long-lived WebSocket connections run in the standalone realtime service, not in Next.js route handlers.
- Internal system/AI realtime publishes broadcast with a system identity for connected clients but persist as room events with `userId: null`; they must not invent fake database users.
- Local development may use HTTP/WS localhost URLs only when server-side `APP_ENV=local` and browser-facing `NEXT_PUBLIC_APP_ENV=local`; every non-local environment must use HTTPS/WSS and fail closed on insecure or missing public URLs.

## Starter System Designs

- Prebuilt templates are static canvas snapshots stored in the codebase.
- Templates are loaded into the active internal realtime canvas state when a user imports one.
- Import can occur on canvas creation or from within the editor at any time.
- Template data follows the same node/edge schema as user-created canvas content.
- Semantic templates seed typed Canvas v2 node metadata for the compact root taxonomy and internal child-layer detail nodes while preserving the existing shape templates.
- Templates do not require a separate database record; they are resolved by template ID at import time.

## AI Generation Model

Architect is the single LLM architecture surface. Arc Forge no longer exposes a legacy design generator route, old canvas-design task runtime, or provider method that directly mutates canvas designs from an old action schema. Chat is collaborator chat, not AI chat; Specs remains specs-oriented.

### Architect Conversation

- Input: project id, project name, current graph id, selected node ids, user message, recent Architect messages, and the sanitized CanvasDoc pyramid JSON loaded from `graph_root` through linked child layers, including graph semanticScan summaries, node/edge metadataSummary records, and child layer summary metadata.
- Execution: durable `architect_conversation` background task via the internal PostgreSQL-backed AI task runner.
- Provider: selected through the same server-side AI provider factory. The provider method is `generateArchitectReply(input)`.
- Output: Architect Conversation v1 JSON containing assistant message, intent, clarification questions, assumptions, warnings, suggested next steps, optional Prompt Pack handoff guidance, and optional canvas patch proposal.
- Persistence: user and assistant messages are stored in one project-wide Architect thread with role, content, graphId provenance, createdAt, linked run id, and sanitized metadata. Recent project messages are sent back to the LLM along with the current graph id; collaborator Chat feed is not used for AI messages.
- Apply: canvas patches are never auto-applied. Supported operations are update-node, add-node, add-edge, create-layer, and update-graph. Unsupported destructive operations are skipped with explicit issues. Apply is authenticated, graph-safe, non-destructive, strips raw secrets/transient UI state, preserves custom/unknown types, writes CanvasDoc through the storage provider, may target any graph in the sanitized canvas pyramid, and publishes graph-scoped realtime snapshots for every modified graph.
- Arc Forge v1 remains an AI-assisted architecture canvas and prompt composer, not an app builder. Architect must not generate app source code, execute code, deploy, write external repositories, or claim that Arc Forge builds the app.

### Spec Generation

- Input: current canvas graph and project context.
- Execution: durable background task via the internal PostgreSQL-backed AI task runner.
- Provider: selected through the same server-side AI provider factory.
- Output: Markdown technical spec saved through the storage provider and linked to the project in the database.

### Architecture Draft Generation

- Input: natural-language prompt, project id, current graph id, current graph summary, root graph summary, graph hierarchy summary where available, optional existing Design IR, and complexity (`simple`, `standard`, `detailed`).
- Execution: durable background task via the internal PostgreSQL-backed AI task runner.
- Provider: selected through the same server-side AI provider factory. The mock provider returns deterministic structured proposals for taxi/booking/dispatch/payments, ecommerce, chat, and generic prompts.
- Output: an Architecture Draft v1 proposal plus validation summary. The proposal may be flat for the current graph or layered with child graph definitions. The task does not mutate the canvas.
- Apply: authenticated project route validates transport/safety constraints again, strips forbidden transient UI state/secrets through the shared sanitizer, appends nodes and edges to the active CanvasDoc, creates or updates child CanvasDoc layers where parent nodes can be resolved, resolves ID collisions deterministically, preserves existing canvas items, writes through the storage provider, and publishes a graph-scoped realtime snapshot when available.
- Arc Forge v1 is an AI-assisted architecture canvas and prompt composer, not an app builder. Arc Forge does not execute or build the app. The LLM is responsible for architecture content and layering; deterministic code does not judge architecture quality, semantic correctness, or layering correctness.

### Design IR Export

- Input: root `graph_root` CanvasDoc plus recursively linked child CanvasDocs referenced by node `subcanvasRef.graphId`.
- Execution: deterministic in-process compiler, not AI.
- Output: read-only JSON export containing project defaults, graph hierarchy, typed semantic sections, relations, validation results, and provenance.
- Missing child graphs, unclassified items, missing required semantic fields, invalid graph IDs, relationship target issues, and raw secret redaction appear as advisory validation results. Export is not blocked.

### Prompt Pack Generation

- Input: sanitized CanvasDoc pyramid JSON containing the root graph, linked child graphs, nested layers, nodes, edges, labels, descriptions, metadata summaries, semantic scan summaries, child layer summaries, custom/unknown architecture types, subcanvasRef values, and graph metadata.
- Execution: durable background task via the internal PostgreSQL-backed AI task runner.
- Provider: selected through the same server-side AI provider factory. The LLM writes Prompt Pack content; deterministic code does not author prompts, choose important architecture context, or judge prompt/architecture quality.
- Output: LLM-authored JSON and Markdown instruction artifacts for Codex, Claude Code, and Generic AI Builder targets, including global, per-layer, and per-node prompts.
- Optional canvas improvement proposals are previewed in the UI and applied only after explicit user approval through the same generic LLM canvas patch mechanism used by Architect. Apply is non-destructive in this version: update-node, add-node, add-edge, create-layer, and update-graph are allowed; destructive delete operations are reported as skipped issues.
- Raw secret-looking values are stripped or redacted before provider calls and rejected in provider output; `secretRef` and `secretCapabilityRef` references survive. Transient UI state such as selected, dragging, presence, cursor, and draft fields is stripped before provider calls and rejected in provider output.
- There is no non-LLM Prompt Pack generator, route, or fallback. Deterministic code does not author Prompt Pack content, generate implementation plans, choose per-node/per-layer prompt content, or judge prompt/architecture quality.

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
14. Prompt Pack generation must use the LLM as the prompt-writing brain from sanitized canvas pyramid JSON. Deterministic code must not author Prompt Pack content or judge prompt/architecture quality; it only handles save/load, JSON transport, no raw secrets, auth/access, preview/apply, undo/redo compatibility, and export/download.
15. Architecture Draft generation must remain proposal-first: AI can propose architecture drafts and layers on the canvas, the user approves before applying, and apply is append-only for v1.
16. Any node may have an inner architecture layer. Deterministic code must not decide whether a node deserves a layer, and must not use semantic type allowlists or denylist logic for child-layer permissions.
17. Architect conversation must remain separate from collaborator Chat and must only mutate canvas state through user-approved LLM canvas patch apply.
18. Semantic Scan warnings are advisory for architecture completeness and must not block child-layer creation, LLM proposals, Prompt Pack generation, Actor/Generic/custom node drill-down, or user-approved non-destructive patches.
19. New node types, modes, or palettes must pass the anti-bloat rule: add them only when they materially improve clarity, LLM reasoning, Prompt Pack quality, commonness, non-redundancy, and non-expert UX.
20. Typed edge relationships must stay compact and general-purpose. Domain-specific edge semantics belong in labels, metadata, notes, or LLM-authored Prompt Packs, not in new relationshipType values unless the product contract is updated.
