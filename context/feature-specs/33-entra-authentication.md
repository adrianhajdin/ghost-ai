Replace Clerk with Microsoft Entra ID authentication for an Azure-oriented deployment.

## Behavior

- Users sign in through Microsoft Entra ID using the Auth.js `azure-ad` provider.
- The default tenant configuration is single-tenant through `ENTRA_TENANT_ID`.
- Auth.js stores an encrypted JWT session using `NEXTAUTH_SECRET`.
- Protected pages and API routes derive identity from the server session.
- The stable application user ID is `${tenantId}:${objectId}`. Email is used only for collaborator matching and display.
- `/sign-up` explains that accounts are managed by the Entra organization and routes users through the same sign-in flow.

## Authorization

- `proxy.ts` performs an optimistic session check and redirects unauthenticated requests to `/sign-in`.
- Route handlers continue to enforce authentication and project ownership/access independently.
- Liveblocks authentication validates the Auth.js session before issuing a room token.
- Collaborator display falls back to stored email addresses; profile enrichment through Clerk is removed.

## Environment

```env
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=
ENTRA_TENANT_ID=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

Register both local and production callback URLs:

- `http://localhost:3000/api/auth/callback/azure-ad`
- `https://<production-host>/api/auth/callback/azure-ad`
