# Development Workflow

## Approach

Build this project incrementally using a spec-driven workflow. Context files define what to build, how to build it, and what the current state of progress is. Always implement against these specs — do not infer or invent behavior from scratch.

## Scoping Rules

- Work on one feature unit or subsystem at a time.
- Prefer small, verifiable increments over large speculative changes.
- Do not combine unrelated system boundaries in a single implementation step.
- Preserve the Canvas v2 product contract: Architect and Prompt Pack content are LLM-authored from CanvasDoc pyramid JSON; deterministic code handles safety, schema, transport, storage, auth/access, preview/apply, and export only.
- Do not add deterministic architecture judges, deterministic Prompt Pack authoring, child-layer semantic-type permission gates, app execution, repo write-back, auto-apply patches, image/multimodal input, or extra AI editing personas unless a future product contract explicitly changes that scope.
- Treat Semantic Scan as advisory for architecture completeness. It may fail only for safety, schema, transport, malformed patch, raw secret, transient UI state, invalid id, unsupported destructive operation, or auth/access issues.
- Keep Canvas v2 semantic taxonomy and relationshipType additions compact. Prefer metadata, labels, tags, proxy references, and Prompt Pack notes over adding niche node or edge enum values.
- Phase 3 advanced node types are contextual, not default toolbar bloat: reference-proxy, runtime-deployment, observability-control, and ai-component should be used only when they materially improve architecture clarity or LLM handoff quality.
- Trust boundary crossing is metadata/advisory context, never a relationshipType. Provider/payment integrations remain general `calls` edges to External System / Provider nodes plus mechanism/security/trust metadata.
- Use Semantic Scan v2 categories, metadataSummary, and child-layer summaries as LLM context and UX guidance, not as deterministic architecture authorship. Snoozed or intentional advisory findings are per-graph panel state and must not suppress blocking safety findings.

## When To Split Work

Split an implementation step if it combines:

- UI changes and background task changes
- Real-time canvas state and database persistence
- Multiple unrelated API routes
- Behavior that is not clearly defined in the context files

If a change cannot be verified end to end quickly, the scope is too broad — split it.

## Handling Missing Requirements

- Do not invent product behavior that is not defined in the context files.
- If a requirement is ambiguous, resolve it in the relevant context file before implementing.
- If a requirement is missing, add it as an open question in `progress-tracker.md` before continuing.
- If external research suggests type-specific child-layer restrictions, apply the Arc Forge product override instead: every node can have a child layer; type-specific behavior is limited to suggestions, examples, and metadata hints.

## Protected Foundation Components

Do not modify generated third-party foundation components unless explicitly instructed.

This includes:

- `components/ui/*` (shadcn/ui components)
- third-party library internals

These should remain default and reusable.

Project-specific styling, layout changes, and feature logic must be implemented in app-level components instead of modifying foundation components.

Only modify these files when a task explicitly requires it.

## Keeping Docs In Sync

Update the relevant context file whenever implementation changes:

- System architecture or boundaries
- Storage model decisions
- Code conventions or standards
- Feature scope

Progress state must reflect the actual state of the implementation, not the intended state.
Progress tracker active sections describe product capabilities and roadmap direction only; do not record PR numbers, branch names, merge state, push state, or GitHub workflow steps there.

## Before Moving To The Next Unit

1. The current unit works end to end within its defined scope.
2. No invariant defined in `architecture-context.md` was violated.
3. `progress-tracker.md` reflects the completed work.
