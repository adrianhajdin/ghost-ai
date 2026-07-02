# Arc Forge AI

## Overview

Arc Forge v1 is an AI-assisted architecture compiler, not an app builder. Users capture application architecture intent on a shared React Flow canvas; AI can propose architecture drafts on the canvas, the user approves before applying, the product normalizes that graph into semantic canvas data, compiles canonical Design IR, and generates copy/download Prompt Pack instruction artifacts for external coding agents.

Prompt Packs are generated from Design IR. Prompt Packs are copy/download instruction artifacts only. Arc Forge does not execute Prompt Packs. Arc Forge does not execute or build the app. Nimbus is not included yet and is not a Prompt Pack target in this version.

## Goals

1. Let authenticated users create and manage architecture projects.
2. Provide a collaborative real-time semantic canvas for system design.
3. Let users import prebuilt starter system designs into the canvas.
4. Let AI propose an initial architecture draft from a natural language prompt.
5. Let collaborators refine the generated architecture and attach semantic metadata.
6. Convert the final graph into durable architecture artifacts such as Markdown technical specs, canonical Design IR, and Prompt Pack instructions for external implementation agents.

## Core User Flow

1. User signs in.
2. User creates or selects a project.
3. User enters the project workspace.
4. User optionally imports a starter system design template into the canvas.
5. User asks AI for an architecture draft proposal.
6. User reviews validation, warnings, nodes, and relations before accepting.
7. Accepted drafts append semantic nodes and edges to the shared canvas.
8. Collaborators edit, classify, and refine the design.
9. User previews or downloads Design IR and Prompt Pack instruction artifacts.
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
- Semantic node and edge metadata with validation warnings for unclassified or incomplete technical meaning.
- Semantic templates for service, database, worker, and auth-module nodes.
- CanvasDoc v1, Design IR v1, and Prompt Pack v1 foundations for external coding-agent instruction generation.
- Canvas snapshots persisted through the configured artifact storage provider.

### Starter System Designs

- A curated library of prebuilt system design templates.
- Users can import a starter template into the canvas at any point during editing.
- Templates are static canvas snapshots loaded directly into the active room.
- Covers common patterns: monolith, microservices, event-driven, serverless, and more.

### AI Architecture Generation

- AI generates a system design from a user-supplied prompt through the configured AI provider.
- Local development uses a deterministic mock AI provider by default; Google Gemini and OpenAI-compatible providers can be selected with server-side environment variables.
- Output is structured as canvas nodes and edges persisted to canvas storage and published through the internal realtime room.
- Generation runs as a durable PostgreSQL-backed background task.

### AI Architecture Drafts

- AI can propose architecture drafts on the canvas from natural language.
- Draft proposals are structured semantic root-canvas nodes and edges, not Markdown-only output.
- The user approves before applying.
- Accepted drafts are append-only and run through deterministic validation, sanitization, CanvasDoc persistence, and realtime publication.
- Arc Forge does not execute or build the app.

### Spec Generation

- The current canvas graph is converted into a Markdown technical specification through the configured AI provider.
- Specs are persisted through the configured artifact storage provider and linked to the project in the database.
- Users can view and download generated specs.

### Prompt Pack Generation

- Prompt Packs are generated from Design IR.
- Prompt Packs are copy/download instruction artifacts only.
- Arc Forge does not execute Prompt Packs.
- Supported Prompt Pack targets are Codex, Claude Code, and Generic AI Builder.
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
- Read-only Design IR export and Prompt Pack instruction export
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
5. The graph can be converted into Design IR, Prompt Pack instructions, and a persisted Markdown spec.
6. Project metadata and generated artifacts are stored in the correct layers.
7. Internal realtime room access is authenticated before any custom realtime connection is accepted.
8. Users can verify their email and recover or change passwords without an external auth provider.
