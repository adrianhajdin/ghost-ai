Set up the backend flow for design generation using Trigger.dev.
This unit handles triggering background jobs, tracking runs, and issuing tokens. No AI logic yet.

## Implementation

1. Add the design trigger route.

   Create: `POST /api/ai/design`
   This route should:
   - accept the design prompt and `roomId`; resolve the project from the authenticated user's access
     - do not trust a client-supplied `projectId`
   - trigger the design task through Trigger.dev
   - create a TaskRun record
   - return the run ID to the client

2. Add task run tracking.

   Create a `TaskRun` model in Prisma to track Trigger.dev runs and verify ownership.

   It should include:
   - `runId` (unique)
   - `projectId`
   - `userId`
   - `createdAt`

   Add:
   - an index on `runId`
   - a compound index on `userId` and `projectId`

3. Add the token route.

   Create: `POST /api/ai/design/token`
   This route should:
   - accept a run ID
   - verify ownership using the TaskRun record
   - generate a Trigger.dev public token scoped to that run
   - return the token to the client

4. Create the design task.

   Create `trigger/design-agent.ts`
   - check the existing Trigger.dev setup and installed agent features first
   - reuse the existing setup instead of creating a new pattern
   - export a minimal design task
   - accept the expected payload (`prompt`, `roomId`, `projectId`, `userId`)
   - log or echo the input for now
   - don’t add AI logic yet

## Scope Limits

- don’t generate nodes or edges yet
- don’t call any AI providers
- don’t update the canvas
- keep this focused on backend task wiring only

## Check When Done

- `POST /api/ai/design` triggers a background task.
- Task runs are stored in Prisma.
- `POST /api/ai/design/token` returns a run-scoped token.
- Design task exists and is callable.
- `npm run build` passes.
