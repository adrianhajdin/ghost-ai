# UI Context

## Theme

Dark only. No light mode. The visual language is a dark technical workspace — near-black backgrounds, layered surfaces, and vivid accent colors for interactive elements.

All colors are defined as CSS custom properties in `globals.css` and mapped to Tailwind tokens via `@theme inline`. Components must use these tokens — no hardcoded hex values or raw Tailwind color classes like `zinc-*`.

| Role             | CSS Variable           | Hex / Value               |
| ---------------- | ---------------------- | ------------------------- |
| Page background  | `--bg-base`            | `#080809`                 |
| Surface          | `--bg-surface`         | `#111114`                 |
| Elevated surface | `--bg-elevated`        | `#18181c`                 |
| Subtle surface   | `--bg-subtle`          | `#1e1e23`                 |
| Default border   | `--border-default`     | `#2a2a30`                 |
| Subtle border    | `--border-subtle`      | `#3a3a42`                 |
| Primary text     | `--text-primary`       | `#f0f0f4`                 |
| Secondary text   | `--text-secondary`     | `#c0c0cc`                 |
| Muted text       | `--text-muted`         | `#808090`                 |
| Faint text       | `--text-faint`         | `#505060`                 |
| Brand accent     | `--accent-primary`     | `#00c8d4` (cyan)          |
| Brand dim        | `--accent-primary-dim` | `rgba(0, 200, 212, 0.12)` |
| AI accent        | `--accent-ai`          | `#6457f9` (indigo-purple) |
| AI text          | `--accent-ai-text`     | `#8b82ff`                 |
| Error            | `--state-error`        | `#ff4d4f`                 |
| Success          | `--state-success`      | `#34d399`                 |
| Warning          | `--state-warning`      | `#fbbf24`                 |

Tailwind utility names map to these variables. Use `bg-base`, `bg-surface`, `text-copy-primary`, `text-copy-muted`, `border-surface-border`, `text-brand`, `bg-accent-dim`, etc.

## Typography

| Role      | Font       | CSS Variable        |
| --------- | ---------- | ------------------- |
| UI text   | Geist Sans | `--font-geist-sans` |
| Code/mono | Geist Mono | `--font-geist-mono` |

Both fonts are loaded via `next/font/google` and applied as CSS variables on the `<html>` element. The base `body` uses Geist Sans with `antialiased`.

## Border Radius

Radius increases with surface depth — smaller for inner elements, larger for outer containers.

| Context           | Class         |
| ----------------- | ------------- |
| Inline / small UI | `rounded-xl`  |
| Cards / panels    | `rounded-2xl` |
| Modal / overlay   | `rounded-3xl` |

## Canvas

### Node Color Palette

8 defined color pairs. Each pair specifies a dark node fill and a vivid contrasting text color tuned for readability on the dark canvas. Defined in `types/canvas.ts` as `NODE_COLORS`.

| Node fill | Text color | Character              |
| --------- | ---------- | ---------------------- |
| `#1F1F1F` | `#EDEDED`  | Neutral dark (default) |
| `#10233D` | `#52A8FF`  | Blue                   |
| `#2E1938` | `#BF7AF0`  | Purple                 |
| `#331B00` | `#FF990A`  | Orange                 |
| `#3C1618` | `#FF6166`  | Red                    |
| `#3A1726` | `#F75F8F`  | Pink                   |
| `#0F2E18` | `#62C073`  | Green                  |
| `#062822` | `#0AC7B4`  | Teal                   |

Default node color: `#1F1F1F` with `#EDEDED` text.

### Edge Style

Smooth-step path with an arrow marker. Default edge color: `#f8fafc`. Stroke width is thin — edges are visually secondary to nodes.

### Node Shapes

6 supported shapes, defined in `types/canvas.ts` as `NODE_SHAPES`. Complex shapes (diamond, hexagon, cylinder) are rendered as inline SVGs rather than CSS borders.

- `rectangle` — default general-purpose node
- `diamond` — decision / gateway
- `circle` — event / endpoint
- `pill` — service / process
- `cylinder` — database / storage
- `hexagon` — external system / boundary

### Connection Handles

Small white circular handles, hidden by default, revealed on node hover. Appear at all four sides of a node.

### Canvas Background

React Flow `<Background>` component. Canvas sits on the base background color.

### Canvas Interaction Model

- Dragging empty canvas selects multiple nodes with a visible selection rectangle.
- Middle or right-dragging empty canvas pans the viewport; mouse wheel zooms.
- Node and edge selection is local UI state only and must not be persisted or broadcast.
- Selected nodes can move as a group, and Delete/Backspace removes selected nodes and edges.
- Node labels must be editable through an explicit Add/Edit label control as well as double-click.
- Edge labels must expose a persistent `+` bubble on the edge, support multiple label bubbles, and keep `data.label` mirrored to the first label for compatibility.
- Existing edges can be reconnected by dragging an endpoint to another compatible node handle.
- Canvas controls include a compact help popover that explains selection, panning, labels, reconnecting, and saving.
- The bottom canvas toolbar is mode-based: Select / Move, Add Semantic Node, Connect Relationship, Drill-down Layer, Inspect Metadata, and Annotate. Shape drawing remains available inside Annotate so architecture-first actions stay prominent without removing general diagramming.
- Add Semantic Node exposes the compact Canvas v2 taxonomy by default and keeps advanced/common-but-less-frequent types behind a More affordance. Child layers additionally expose internal detail templates such as endpoints, entities, event contracts, rules, and policies.
- Connect Relationship exposes quick relationship types first, then advanced relationships, and newly drawn edges persist both `relationshipType` and compatible label data.
- Nodes show a compact semantic type badge; unclassified nodes use warning styling.
- Selected nodes and edges expose a local property inspector for semantic type, relationship type, responsibilities, ownership, boundary/layer role, interfaces, data/events, operational/security/privacy notes, source/assumption/decision refs, and type-specific fields.
- Edge relationship type is edited from the inspector and may show a compact badge only during active edge interaction.
- Semantic warnings are advisory and do not block saving.
- Any node can create and open an inner architecture layer through `subcanvasRef`; the editor URL carries the active `graphId`, breadcrumbs return to the parent layer or system root, and empty child layers show a compact generic internal-detail guide.
- The UI must not disable, hide, or label drill-down as unavailable based on semantic type. Actor-like, generic, custom, unknown, or decorative-looking nodes can still open child layers when meaningful.
- Child architecture layers expose compact semantic templates for endpoints, entities, workers, event contracts, business rules, validation rules, and policies while preserving the same React Flow interaction model.
- Node type can influence starter templates, quick prompts, and metadata suggestions only; it must not become a child-layer permission system.

### Canvas v2 Anti-Bloat

- Default toolbar/palette choices should stay understandable for non-experts.
- Add a new node type or mode only when it materially improves architecture clarity, LLM reasoning, Prompt Pack quality, and common modern software architecture modeling.
- Prefer generic/custom nodes plus metadata/tags when the distinction is niche, domain-specific, classificatory, or cleanly represented by an existing type.
- Do not turn the canvas into a full UML, BPMN, ArchiMate, or cloud vendor mega-palette implementation.

## Component Library

shadcn/ui on top of Tailwind. No custom design system. Components live in `components/ui/`. Use the `shadcn` CLI to add new components rather than writing them from scratch.

## Layout Patterns

- Editor workspace: full-viewport layout with a responsive cockpit shell. On large viewports, open left and right sidebars reserve canvas gutters so canvas tools and semantic inspectors do not sit underneath them.
- Sidebars: floating glass panels with dark semi-transparent background and subtle border. On smaller viewports, the project sidebar behaves like a modal navigation deck with a strong backdrop instead of competing with canvas inspectors.
- Canvas graph breadcrumb: a small glass overlay sits below the navbar; it identifies the current graph and, inside child layers, exposes an explicit `Back to System` or `Back to parent layer` control so users can move through the architecture pyramid without relying on browser Back. It must avoid overlapping the sidebars or inspector.
- Workspace navbar actions compress to icon-only controls on small viewports, while desktop keeps text labels for faster scanning.
- Compact account menu: on small workspaces, the avatar remains the only navbar account trigger and opens a compact cockpit-style popover with Account and Sign out actions layered above the mobile project deck.
- Design IR preview/export: the workspace navbar exposes a compact `FileJson` action that opens a bounded cockpit-style modal with status, compiled graph IDs, validation counts, JSON preview, Copy JSON, and Download JSON. Design IR is machine-readable architecture.
- Prompt Pack preview/export: the workspace navbar exposes a compact Prompt Pack action that opens a separate bounded cockpit-style modal. The flow lets users choose Codex, Claude Code, or Generic AI Builder, choose full-project/current-layer/selected-node scope, add extra instructions, and generate an LLM-authored Prompt Pack from the sanitized canvas pyramid through the AI task runner. There is no non-LLM Prompt Pack generator, route, or fallback. Preview tabs show Global Prompt, Layers, Nodes, Canvas Improvements, and JSON. Copy/download controls export the generated Markdown/JSON locally. Canvas improvements are previewed and applied only after explicit user approval. Arc Forge does not execute Prompt Packs, build the app, or write external repositories. Nimbus is not included as a Prompt Pack target in this version.
- AI Workspace sidebar: the sidebar exposes exactly one LLM interaction tab, `Architect`, plus `Chat` for human collaborator discussion and `Specs` for spec generation/browsing. Architect is a conversational cockpit workspace: header/context strip, persisted project-wide message thread with graph provenance, user input, quick actions, canvas-aware proposal preview/apply, and a Prompt Pack entry point. It reads the sanitized canvas pyramid through the task runner and may propose non-destructive canvas patches for any graph in the architecture pyramid, but the canvas changes only after the user clicks apply. Chat must remain project chat for workspace members, not an AI assistant surface. Specs remains dedicated to spec generation, preview, and download. No Design AI tab is exposed.
- On mobile and mobile-landscape viewports, AI Workspace opens as a high-priority drawer over the canvas instead of disappearing below the desktop sidebar breakpoint. Canvas controls and the semantic toolbar stack without overlapping; primary toolbar modes use icon buttons with accessible labels, while detailed semantic/relationship choices live in the second row.
- Modals and dialogs: centered overlay, `rounded-3xl`, dark background with backdrop blur.
- Navbar: top bar with dark background and bottom border.

## Icons

Lucide React. Stroke-based icons only — no filled variants. Icon sizes: `h-4 w-4` for inline, `h-5 w-5` for buttons, `h-8 w-8` for feature icons in empty states.
