Complete the existing AI sidebar placeholder and turn it into a proper floating chat sidebar component. The sidebar already exists, so keep the current floating placement and smooth slide-in behavior from the right side. This unit is focused on building out the sidebar UI inside it, including access to project AI provider settings.

## Implementation

1. Separate the AI sidebar into its own component.
   - keep the open/close state controlled by the parent
   - preserve the existing slide animation, floating position, border, background, and shadow styling
   - use sidebar surface styles like `bg-base/95`, `border-surface-border`, and the current shadow treatment

2. Add the sidebar header.
   - title: `AI Workspace`
   - subtitle: `Collaborate with Ghost AI`
   - small bot icon
   - close button aligned to the right
   - use `text-primary-text` for the title
   - use `text-muted-text` for the subtitle

3. Add a tabbed layout with the architect, chat, and specs tabs.

   Use shadcn `Tabs`.
   - `AI Architect`
   - `Specs`
   - provider settings are available from the sidebar header
   - active tab should use the accent styling, like `bg-accent` and `text-accent`
   - inactive tab text should stay muted with `text-muted-text`

4. Build the AI Architect tab.

   Use shadcn components where they fit, especially `Button` and `Textarea`.
   - scrollable chat area
   - empty state with bot icon, short description, and starter prompt chips
   - starter chips:
     - `Design an e-commerce backend`
     - `Create a chat app architecture`
     - `Build a CI/CD pipeline`
   - style starter chips as soft pills using `bg-subtle` and `text-accent-text`
   - user messages should be right-aligned with `bg-brand-dim border-brand/50 border-2 text-copy-primary`
   - assistant messages should be left-aligned with `bg-elevated border border-surface-border text-accent-text`
   - input area with an auto-resizing textarea, around 72px min height and 160px max height
   - send button should use `bg-accent text-white`
   - `Enter` submits, `Shift+Enter` adds a newline

5. Build the Specs tab.
   - show a `Generate Spec` button using `bg-accent text-white`
   - show a demo spec card for now
   - style the card with `bg-elevated` and `border-surface-border`
   - include a file/spec icon, title, short snippet, and disabled download action

6. Use the existing project color tokens.

   Check `globals.css`, `ui-context.md` or the Tailwind mapping before adding direct color values. Avoid inventing new colors if a matching token already exists.

## Scope Limits

- don’t rebuild the existing sidebar open/close behavior
- don’t add backend logic
- don’t add Liveblocks or AI generation logic yet
- keep this focused on the sidebar UI structure

## Check When Done

- AI sidebar is separated into its own component.
- Existing floating slide-in behavior is preserved.
- Sidebar includes AI Architect and Specs tabs.
- AI Architect tab has empty state, starter chips, and input UI.
- Specs tab has a generate button and a static demo spec card.
- `npm run build` passes.
