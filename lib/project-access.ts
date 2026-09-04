import { prisma } from "@/lib/prisma"
import { getCurrentSession } from "@/lib/auth"

export interface ProjectIdentity {
  userId: string | null
  primaryEmailAddress: string | null
  displayName: string | null
  avatarUrl: string | null
}

export async function getCurrentProjectIdentity(): Promise<ProjectIdentity> {
  const session = await getCurrentSession()
  const user = session?.user

  if (!user?.id) {
    return {
      userId: null,
      primaryEmailAddress: null,
      displayName: null,
      avatarUrl: null,
    }
  }

  return {
    userId: user.id,
    primaryEmailAddress:
      user.email?.trim().toLowerCase() ?? null,
    displayName: user.name?.trim() || null,
    avatarUrl: user.image ?? null,
  }
}

export async function getAccessibleProject(
  projectId: string,
  identity: ProjectIdentity
) {
  if (!identity.userId) return null

  return prisma.project.findFirst({
    where: {
      id: projectId,
      OR: identity.primaryEmailAddress
        ? [
            { ownerId: identity.userId },
            {
              collaborators: {
                some: {
                  email: {
                    equals: identity.primaryEmailAddress,
                    mode: "insensitive",
                  },
                },
              },
            },
          ]
        : [{ ownerId: identity.userId }],
    },
  })
}

export async function userHasProjectAccess(
  projectId: string,
  identity: ProjectIdentity
) {
  const project = await getAccessibleProject(projectId, identity)
  return Boolean(project)
}
