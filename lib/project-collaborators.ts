import { prisma } from "@/lib/prisma"
import { getAccessibleProject, type ProjectIdentity } from "@/lib/project-access"

export interface ProjectSharePerson {
  email: string | null
  displayName: string
  avatarUrl: string | null
  role: "owner" | "collaborator"
}

export interface ProjectShareDetails {
  projectId: string
  projectName: string
  canManage: boolean
  owner: ProjectSharePerson
  collaborators: ProjectSharePerson[]
}

export function normalizeCollaboratorEmail(email: string) {
  return email.trim().toLowerCase()
}

export function isValidCollaboratorEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function getProjectShareDetails(
  projectId: string,
  identity: ProjectIdentity
): Promise<ProjectShareDetails | null> {
  const accessibleProject = await getAccessibleProject(projectId, identity)

  if (!accessibleProject) {
    return null
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      collaborators: {
        select: {
          email: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  })

  if (!project) {
    return null
  }

  const collaboratorEmails = project.collaborators.map((collaborator) =>
    normalizeCollaboratorEmail(collaborator.email)
  )

  const isOwner = identity.userId === project.ownerId
  const ownerEmail = isOwner ? identity.primaryEmailAddress : null
  const ownerDisplayName = isOwner
    ? identity.displayName ?? ownerEmail ?? "Project owner"
    : "Project owner"

  return {
    projectId: project.id,
    projectName: project.name,
    canManage: isOwner,
    owner: {
      email: ownerEmail,
      displayName: ownerDisplayName,
      avatarUrl: isOwner ? identity.avatarUrl : null,
      role: "owner",
    },
    collaborators: collaboratorEmails.map((email) => {
      return {
        email,
        displayName: email,
        avatarUrl: null,
        role: "collaborator" as const,
      }
    }),
  }
}
