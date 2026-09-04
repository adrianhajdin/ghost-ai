Show active room participants inside the editor canvas view,
without changing the editor home navbar.

## Implementation

1. Keep the existing navbar behavior as-is.
   - do not change the editor home navbar
   - do not move or redesign the shared navbar component globally
   - if the editor home and editor canvas use the same navbar
     component, make sure this presence UI only appears in the
     canvas/editor room view

2. Add the participant avatar group inside the editor canvas area.
   - position it in the top-right corner of the editor canvas view
   - keep it visually separate from the main navbar actions
   - get the current user's ID from the active Entra session
   - filter the Liveblocks presence list to exclude any entry
     whose user ID matches the current Entra user ID
   - render the filtered list as collaborator avatars only
   - render the current user separately using the shared sign-out
     control — do not render a second avatar for them from
     the Liveblocks presence list
   - keep collaborator avatars and the sign-out control the same
     size so the group looks visually consistent
   - collaborator avatars are display-only, not interactive
   - show a divider between the collaborator avatars and the
     sign-out control only when at least one collaborator exists
   - if no collaborators are present, show only the sign-out
     control with no divider

3. Render collaborator avatars.
   - use profile photos when available
   - fall back to initials when there is no image
   - show up to five collaborator avatars in an overlapping stack
   - show a +N overflow chip when there are more than five
   - add a subtle ring so avatars stay readable on the dark canvas

4. Add live cursors to the canvas.
   - render cursors for other participants only, never the
     current user
   - use the existing Liveblocks presence state to broadcast
     cursor position
   - update cursor position on React Flow's onMouseMove event
   - clear cursor to null on mouse leave
   - show a small colored pointer with a name badge attached
   - match the pointer and badge color to the participant's
     presence color

5. Define the shared presence type in `liveblocks.config.ts`.

   Presence should include:
   - `cursor`: `{ x: number; y: number } | null`
   - `thinking`: boolean

## Scope Limits

- don't add participant avatars to the shared navbar globally
- don't remove existing navbar actions like Save, Import,
  Share, or AI
- don't replace Entra session behavior
- don't make collaborator avatars interactive
- don't change canvas node or edge behavior

## Check When Done

- Presence avatars only appear in the editor canvas view.
- Editor home navbar is unchanged.
- Current user is resolved from the active Entra session.
- Collaborator avatars exclude the current user.
- Divider only appears when collaborators exist.
- Cursor position is broadcast via Liveblocks presence on
  React Flow mouse events.
- Canvas renders live cursors for other participants only.
- `npm run build` passes.
