# Code Standards

## General

- Keep modules small and single-purpose.
- Fix root causes — do not layer workarounds.
- Do not mix unrelated concerns in one component or route.
- Respect the system boundaries defined in `architecture-context.md`.

## TypeScript

- Strict mode is required throughout the project.
- Avoid `any`; use explicit interfaces or narrowly scoped types.
- Validate unknown external input at system boundaries before trusting it.
- Use `interface` for object contracts.

## Next.js

- Default to React Server Components.
- Add `"use client"` only when the component needs browser interactivity, hooks, or real-time state.
- Keep route handlers focused on a single responsibility.
- Long-running work belongs in background tasks, not in request handlers.

## Styling

- Use CSS custom property tokens defined in `globals.css` — no raw Tailwind color classes like `zinc-*` or hardcoded hex values.
- Reference tokens through their Tailwind utility names: `bg-base`, `text-copy-primary`, `border-surface-border`, `text-brand`, etc.
- Maintain the border radius scale: `rounded-xl` for small elements, `rounded-2xl` for cards, `rounded-3xl` for modals.

## API Routes

- Validate and parse request input before any logic runs.
- Enforce auth and project ownership checks before any mutation.
- Return consistent, predictable response shapes.
- Keep route handlers thin — push complexity into shared modules or background tasks.
- Browser-facing token or realtime endpoints must fail closed outside `APP_ENV=local` unless HTTPS/WSS transport can be verified.

## Data and Storage

- Project metadata and relationships belong in PostgreSQL via Prisma.
- Canvas snapshots and generated specs belong in the configured artifact storage provider; Prisma stores only the provider object reference.
- Local filesystem storage must remain scoped under `LOCAL_STORAGE_ROOT` and must reject traversal outside that root.
- Do not store large generated content directly in the database.
- Task run records are first-class relational data — treat ownership and run IDs as verified before any token issuance.
- Realtime room event records are foundation data for the internal collaboration engine; keep them compact and scoped by project/room/user.

## Runtime Configuration

- Treat only `APP_ENV=local` as server local development.
- Treat only `NEXT_PUBLIC_APP_ENV=local` as browser local development.
- Local development may use `http://localhost` and `ws://localhost`; non-local environments require `https://` and `wss://`.
- Do not guess production URLs, downgrade secure URLs, or fall back to localhost outside explicit local mode.
- Never log realtime tokens, session cookies, internal service secrets, or signed token values.
- `AI_PROVIDER` defaults to `mock`; external AI keys must only be required when their provider is selected.
- AI provider keys are server-only and must never use `NEXT_PUBLIC_` prefixes.
- Validate structured AI output before applying it to canvas state.
- `EMAIL_PROVIDER` defaults to `dev_console` only in local mode; SMTP credentials must be server-only and required only when `EMAIL_PROVIDER=smtp`.
- Raw account verification and password reset tokens must never be stored; store only hashes and consume tokens after successful use.

## File Organization

- `lib/` — shared infrastructure: Prisma client, auth helpers, utilities.
- `lib/ai/` — AI provider contracts, provider factory, provider adapters, and spec/draft/prompt-pack helpers.
- `lib/ai-tasks/` — durable AI task leasing, handlers, and worker orchestration.
- `lib/email/` — server-only account email provider abstraction.
- `lib/realtime/` — signed room tokens, protocol types, access checks, room state, and standalone WebSocket server logic.
- `scripts/ai-worker.ts` — AI worker process entrypoint.
- `scripts/realtime-server.ts` — internal realtime WebSocket service entrypoint.
- `components/` — UI composition only; no business logic.
- `app/api/` — route handlers for auth, triggering, and persistence.
- Name files after the responsibility they contain, not the technology.
