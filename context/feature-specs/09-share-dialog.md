Add a `Share` button to the editor navbar that opens the share dialog.

Owners can:

- invite collaborators by email
- view current collaborators
- remove collaborators
- copy the project link with temporary `Copied!` feedback

Collaborators can:

- view the collaborator list only
- not invite, remove, or manage access

## Entra User Data

Collaborators are stored by email in the database.

Use the authenticated Entra session to provide the current user's identity. Collaborator records should use:

- display name
- avatar image

If a collaborator's profile is not available from Entra claims, fall back to showing the stored email only.

## Implementation

Add the required API logic for:

- listing collaborators
- inviting collaborators
- removing collaborators

Enforce ownership server-side for invite and remove actions.

Do not add a local user table.

## Check When Done

- share dialog opens from the workspace
- owners can invite and remove collaborators
- collaborators see read-only access
- collaborator names/avatars use session claims when available and otherwise fall back to email
- `npm run build` passes
