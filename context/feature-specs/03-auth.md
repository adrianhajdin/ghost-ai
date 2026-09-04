Use Microsoft Entra ID and Auth.js for authentication, session management, redirects, route protection, and the user menu.

## Design

- Use a minimal two-panel sign-in layout with the existing dark workspace styling.
- Use the Microsoft Entra ID provider through Auth.js.
- Keep the sign-in page focused on one "Continue with Microsoft Entra ID" action.
- Accounts are managed by the configured Entra tenant; there is no separate application sign-up flow.

## Implementation

- Configure Auth.js in `lib/auth.ts` with the `azure-ad` provider and JWT sessions.
- Use `proxy.ts` at the project root for optimistic session redirects.
- Keep authorization checks in every page and route handler.
- Use `tenantId:objectId` as the stable application identity and email only as a collaborator attribute.
- Keep `/` redirect behavior:
  - authenticated users go to `/editor`
  - unauthenticated users go to `/sign-in`
- Use the shared sign-out control in editor surfaces.

## Environment

```env
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=
ENTRA_TENANT_ID=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

Register these callback URLs in the Entra app:

- `http://localhost:3000/api/auth/callback/azure-ad`
- `https://<production-host>/api/auth/callback/azure-ad`
