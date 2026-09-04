import { getServerSession } from "next-auth"
import type { NextAuthOptions, Profile } from "next-auth"
import AzureADProvider from "next-auth/providers/azure-ad"

interface EntraProfile extends Profile {
  oid?: string
  tid?: string
  preferred_username?: string
  picture?: string
}

function getStableUserId(profile: EntraProfile): {
  userId: string
  tenantId: string | null
  objectId: string
} {
  const objectId = profile.oid ?? profile.sub
  if (!objectId) {
    throw new Error("Microsoft Entra did not return a stable object identifier.")
  }

  const configuredTenantId = process.env.ENTRA_TENANT_ID?.trim()
  const tenantId = profile.tid ?? configuredTenantId ?? null
  if (!tenantId || tenantId === "common" || tenantId === "organizations") {
    throw new Error("Microsoft Entra must provide a tenant ID for stable user identity.")
  }

  return {
    userId: tenantId ? `${tenantId}:${objectId}` : objectId,
    tenantId,
    objectId,
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/sign-in",
  },
  providers: [
    AzureADProvider({
      clientId: process.env.ENTRA_CLIENT_ID ?? "",
      clientSecret: process.env.ENTRA_CLIENT_SECRET ?? "",
      tenantId: process.env.ENTRA_TENANT_ID ?? "common",
    }),
  ],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        const entraProfile = profile as EntraProfile
        const identity = getStableUserId(entraProfile)
        token.userId = identity.userId
        token.tenantId = identity.tenantId
        token.objectId = identity.objectId
        token.email =
          entraProfile.email ??
          entraProfile.preferred_username ??
          token.email
        token.name = entraProfile.name ?? token.name
        token.picture = entraProfile.picture ?? token.picture
      }

      return token
    },
    async session({ session, token }) {
      if (typeof token.userId === "string") {
        session.user.id = token.userId
      }
      if (typeof token.tenantId === "string") {
        session.user.tenantId = token.tenantId
      }
      if (typeof token.objectId === "string") {
        session.user.objectId = token.objectId
      }

      return session
    },
  },
}

export function getCurrentSession() {
  return getServerSession(authOptions)
}
