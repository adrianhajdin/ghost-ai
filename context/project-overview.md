# Arc Forge AI

## Overview

Arc Forge v1 is an AI-assisted architecture canvas and prompt composer, not an app builder. Users capture application architecture intent on a shared layered React Flow canvas; Architect is the single LLM architecture surface where users can talk with the LLM, clarify requirements, inspect layers, and preview/apply LLM-proposed canvas changes. The product stores the canvas, compiles canonical Design IR, and lets the LLM generate copy/download Prompt Pack instruction artifacts directly from the canvas pyramid for external coding agents.

The canvas is a layered architecture pyramid: root context at the top, deeper layers for internal detail. The LLM is responsible for architectural intelligence, layering, and prompt writing. Deterministic code only handles canvas storage, JSON transport, no raw secrets, auth/access, preview/apply, undo/redo compatibility, conversation persistence, and export/download.

The LLM is responsible for Prompt Pack content. Prompt Packs are generated directly from sanitized CanvasDoc pyramid JSON, not from deterministic Design IR summaries. Prompt Packs are copy/download instruction artifacts only. Arc Forge does not execute Prompt Packs, build the app, or write to external repositories. Nimbus is not included yet and is not a Prompt Pack target in this version.

## Canvas v2 Product Contract

Arc Forge v2 direction is C4-inspired rather than UML/BPMN/ArchiMate-complete. It is an AI-assisted, layered architecture canvas and prompt composer. React Flow remains the renderer, and CanvasDoc JSON remains the source of truth. Screenshots or future image attachments may be supplemental evidence only; they must never replace CanvasDoc as the durable architecture state.

Every node can have a child architecture layer. Services, databases, actors, generic/custom nodes, unknown nodes, and decorative-looking nodes may all be drilled into when the user or LLM decides that a deeper layer is meaningful. Node type may influence starter templates, example prompts, metadata suggestions, and Semantic Scan hints, but it must never become a permission gate. There must be no allowlist, denylist, disabled UI, or "not eligible" logic for child layers by semantic type.

Architect is the architecture reasoning layer. It reads the sanitized CanvasDoc pyramid JSON, current graph id, selected node ids, project-wide conversation, graph provenance, and provider metadata. It may propose nodes, edges, metadata, child layers, cross-layer changes, and Prompt Pack readiness guidance. Users manually preview and apply non-destructive patch proposals.

Deterministic code is limited to safety, transport, storage, schema compatibility, auth/access, sanitization, preview/apply mechanics, export/download, and conversation persistence. It must not author architecture, judge architecture quality, decide whether a node deserves internals, generate Prompt Pack content, or block Prompt Pack generation because architecture metadata is incomplete.

Semantic Scan is advisory for architecture completeness. It may warn about missing edge types, responsibilities, owners, trust notes, retry/idempotency notes, empty child layers, vague labels, observability/deployment gaps, and AI safety/tool-access notes. It may only block or fail for safety, schema, transport, malformed patch, raw secret, transient UI state, invalid id, unknown target, unsupported destructive operation, or auth/access issues.

Prompt Packs are LLM-authored from CanvasDoc pyramid JSON. Mechanical rendering, copying, downloading, and schema validation of the LLM-authored output are allowed, but deterministic Prompt Pack authoring, fallback generation, and architecture-quality judging are not.

New node types or modes should be added only when they materially improve architecture clarity, LLM reasoning, Prompt Pack quality, and common modern software architecture modeling without making the default palette harder for non-experts. Prefer generic/custom nodes, metadata, and tags when a concept is niche, domain-specific, classificatory, or already representable by an existing type plus metadata.

Canvas v2 Phase 1 uses a compact semantic foundation rather than a large diagramming notation. Default root node types are actor, client-surface, service, worker, database, event-channel, external-system, identity-auth, and generic-component; advanced root types add cache-store and object-store. Child layers can use internal detail types such as endpoint, entity, event-contract, business-rule, validation-rule, policy, and spec-note. Legacy frontend, queue, cache, and auth-module data is normalized into the new taxonomy while preserving custom or unknown architecture type metadata.

Edges carry a relationshipType separate from freeform labels. Fast relationship choices are interacts_with, calls, reads, writes, publishes, consumes, authenticates_via, and runs_on; advanced choices are triggers, monitors, depends_on, and syncs_with. Edge labels remain multi-label friendly, and legacy edge semantic names normalize into this relationship model.

Canvas v2 Phase 2 deepens the same contract without expanding the taxonomy. The inspector is organized into progressive metadata sections for node overview, interfaces, data, events, security, operations, Prompt Pack notes, open questions, child layer state, edge mechanism, edge data/events, and trust notes. Semantic Scan v2 groups advisory findings by relationship clarity, topology quality, state ownership, async integrity, security integration, operability, AI governance, and safety; users can snooze or mark non-blocking findings intentional. Child layers now maintain parent-visible summary metadata such as childLayerSummary, lastLayerSummary, decompositionStatus, and childLayerUpdatedAt so the LLM and Prompt Pack flow can understand decomposition state from the CanvasDoc pyramid.

Canvas v2 Phase 3 keeps the compact model while improving serious-system modeling. Relationship types stay general-purpose, but edges can now carry criticality, directionality, reliability, retry/idempotency, consistency, rate-limit, timeout, fallback, and ownership notes. Trust boundaries are metadata and subtle visual context through boundary, trustZone, exposure, dataSensitivity, authExpectation, securityNotes, and trustNotes; trust boundary crossing is not an edge type. Cross-layer reference-proxy nodes can point at nodes, edges, or graphs owned elsewhere without becoming duplicate implementation targets. Runtime / Deployment Unit, Observability / Control Plane, AI Component, and Reference Proxy are advanced/contextual semantic types behind secondary UI and LLM suggestions, not default toolbar bloat.

## Goals

1. Let authenticated users create and manage architecture projects.
2. Provide a collaborative real-time semantic canvas for system design.
3. Let users import prebuilt starter system designs into the canvas.
4. Let users refine architecture through a conversational LLM Architect workspace.
5. Let collaborators refine the generated architecture and attach semantic metadata.
6. Convert the final graph into durable architecture artifacts such as Markdown technical specs, canonical Design IR, and LLM-authored Prompt Pack instructions for external implementation agents.

## Core User Flow

1. User signs in.
2. User creates or selects a project.
3. User enters the project workspace.
4. User optionally imports a starter system design template into the canvas.
5. User talks with Architect to inspect the current canvas/layer, ask questions, refine selected nodes, add missing pieces, or prepare for Prompt Pack generation.
6. Architect replies conversationally and may propose non-destructive canvas changes.
7. User previews proposed changes and explicitly applies them before the canvas mutates.
8. Collaborators edit, classify, and refine the design while Chat remains human collaborator chat.
9. User generates, previews, copies, or downloads LLM-authored Prompt Pack instruction artifacts through the Prompt Pack flow.
10. User triggers spec generation when they need a persisted Markdown technical spec.
11. App persists the generated Markdown spec.
12. User reviews or downloads the spec.

## Features

### Authentication and Projects

- User sign-in and route protection.
- My Account, email verification, forgot password, reset password, and logged-in password change flows.
- Provider-backed account email delivery with local console delivery and production SMTP support.
- Project creation, ownership, and collaborator access.
- Project list and workspace navigation.

### Collaborative Canvas

- Shared real-time canvas using the internal WebSocket collaboration engine and React Flow.
- Internal realtime provides authenticated room tokens, presence, chat/status events, and canvas synchronization.
- Live cursors, presence indicators, and node/edge editing.
- Canvas v2 semantic node taxonomy, typed edge relationships, compact architecture metadata, and advisory validation warnings for incomplete technical meaning.
- Rich semantic inspector sections for overview, interfaces, data, events, security, operations, Prompt Pack notes, open questions, child layer state, relationship mechanism, reliability, data/events, and trust notes.
- Semantic Scan v2 grouped advisory signals for relationship clarity, topology, state ownership, async integrity, trust boundaries, cross-layer references, runtime operations, AI governance, and safety, with user snooze/intentional state persisted per graph while safety/schema/transport/auth issues remain the only blocking class.
- Semantic templates for actor, client surface, service, worker, database, event channel, external system, identity/auth, generic component, cache store, object store, advanced contextual runtime/observability/AI/reference proxy nodes, and internal child-layer detail nodes.
- Any node may have an inner architecture layer. Child layers can be created from the root canvas or another child layer.
- Child layer summaries are reflected on the parent node and included in the sanitized canvas pyramid for Architect and Prompt Pack generation.
- CanvasDoc v1, Design IR v1, and LLM Prompt Pack v1 foundations for external coding-agent instruction generation.
- Canvas snapshots persisted through the configured artifact storage provider.

### Starter System Designs

- A curated library of prebuilt system design templates.
- Users can import a starter template into the canvas at any point during editing.
- Templates are static canvas snapshots loaded directly into the active room.
- Covers common patterns: monolith, microservices, event-driven, serverless, and more.

### AI Architecture Drafts

- AI can propose architecture drafts on the canvas from natural language.
- Draft proposals are structured canvas nodes, edges, and optional child graph layers, not Markdown-only output.
- The user approves before applying.
- Accepted drafts are append-only and run through deterministic transport/safety validation, sanitization, CanvasDoc persistence, and realtime publication.
- Arc Forge does not execute or build the app.
- Architect is the single LLM architecture surface. There is no legacy design generator route or old canvas-design runtime.

### Architect Conversational Workspace

- Architect is conversational: users can describe an app, ask questions, clarify requirements, inspect the current layer, refine nodes/edges/layers, ask what is missing, create deeper layers, and prepare the architecture before Prompt Pack generation.
- Architect reads the sanitized CanvasDoc pyramid JSON directly, including root graph, linked child graphs, nested layers, metadata summaries, semantic scan summaries, custom architecture types, labels, descriptions, assumptions, warnings, child layer summaries, decomposition status, and subcanvasRef values.
- Architect conversation messages are persisted as one project-wide thread with each message retaining graphId provenance, and kept separate from collaborator Chat.
- Architect may return clarification questions, assumptions, warnings, suggested next steps, Prompt Pack handoff guidance, and optional canvas patch proposals that can target any graph in the canvas pyramid when the requested design change belongs in a parent, child, or deeper layer.
- LLM canvas changes are previewed and applied only after explicit user approval. Arc Forge does not auto-apply, execute, build apps, generate app source code, or write external repositories.

### Spec Generation

- The current canvas graph is converted into a Markdown technical specification through the configured AI provider.
- Specs are persisted through the configured artifact storage provider and linked to the project in the database.
- Users can view and download generated specs.

### Prompt Pack Generation

- Prompt Packs are generated by the LLM from the sanitized canvas pyramid: root graph, child graphs, nested layers, nodes, edges, metadata summaries, semantic scan summaries, child layer summaries, descriptions, labels, and subcanvasRef values.
- Prompt Packs are copy/download instruction artifacts only.
- Arc Forge does not execute Prompt Packs, generate application code, build the app, or write external repositories.
- Supported Prompt Pack targets are Codex, Claude Code, and Generic AI Builder.
- There is no non-LLM Prompt Pack generator, route, or fallback.
- Deterministic code does not author Prompt Pack content or judge prompt/architecture quality; it only handles save/load, JSON transport, no raw secrets, auth/access, preview/apply, undo/redo compatibility, and export/download.
- Optional canvas improvements from the LLM are previewed and applied only after explicit user approval.
- Nimbus is not included as a Prompt Pack target in this version.

## Scope

### In Scope

- Authentication and route protection
- Account verification and password recovery
- Project creation and ownership
- Collaborator access by project
- Starter system design template library and import
- Real-time shared canvas with nodes, edges, and presence
- Internal realtime room/presence/event runtime for collaborative canvas state
- AI-powered architecture generation from prompts
- AI-powered architecture draft proposals with preview, validation, and user-approved append-only apply
- AI-powered Markdown spec generation from the canvas graph
- Read-only Design IR export and LLM Prompt Pack instruction export
- Persistent storage for project metadata and generated artifacts
- Spec download

### Out Of Scope

- Billing and subscription systems
- Enterprise permission tiers beyond owner and collaborator
- Versioned spec history and review workflows
- Advanced artifact retention/versioning policies
- Mobile-native applications
- In-app code generation, repository write-back, branch automation, pull request automation, sandbox execution, and autonomous app building
- Arc Forge executing Prompt Packs, building generated apps, or writing target application repositories

## Success Criteria

1. A signed-in user can create and open a project.
2. Multiple users can collaborate in the same canvas simultaneously.
3. A user can import a prebuilt starter design into the canvas.
4. AI can propose an architecture draft from a prompt and apply it only after user approval.
5. The graph can be converted into Design IR, LLM-authored Prompt Pack instructions, and a persisted Markdown spec.
6. Project metadata and generated artifacts are stored in the correct layers.
7. Internal realtime room access is authenticated before any custom realtime connection is accepted.
8. Users can verify their email and recover or change passwords without an external auth provider.
