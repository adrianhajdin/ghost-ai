import {
  getProjectShareDetails,
  isValidCollaboratorEmail,
  normalizeCollaboratorEmail,
} from "@/lib/project-collaborators"
import { getCurrentProjectIdentity } from "@/lib/project-access"
import { prisma } from "@/lib/prisma"

function getEmailFromBody(body: unknown) {
  if (typeof body !== "object" || body === null || !("email" in body)) {
    return null
  }

  const value = (body as { email: unknown }).email

  return typeof value === "string" ? normalizeCollaboratorEmail(value) : null
}

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/projects/[projectId]/collaborators">
) {
  const identity = await getCurrentProjectIdentity()

  if (!identity.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { projectId } = await ctx.params
  const share = await getProjectShareDetails(projectId, identity)

  if (!share) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  return Response.json({ share })
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/projects/[projectId]/collaborators">
) {
  const { userId } = await getCurrentProjectIdentity()

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { projectId } = await ctx.params
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true },
  })

  if (!project) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  if (project.ownerId !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const body: unknown = await request.json().catch(() => ({}))
  const email = getEmailFromBody(body)

  if (!email || !isValidCollaboratorEmail(email)) {
    return Response.json({ error: "A valid email is required" }, { status: 400 })
  }

  const identity = await getCurrentProjectIdentity()

  if (identity.primaryEmailAddress && email === identity.primaryEmailAddress) {
    return Response.json(
      { error: "The project owner already has access" },
      { status: 400 }
    )
  }

  const existingCollaborator = await prisma.projectCollaborator.findUnique({
    where: {
      projectId_email: {
        projectId,
        email,
      },
    },
  })

  if (existingCollaborator) {
    return Response.json(
      { error: "That collaborator already has access" },
      { status: 409 }
    )
  }

  await prisma.projectCollaborator.create({
    data: {
      projectId,
      email,
    },
  })

  return Response.json({ ok: true }, { status: 201 })
}

export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/projects/[projectId]/collaborators">
) {
  const { userId } = await getCurrentProjectIdentity()

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { projectId } = await ctx.params
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true },
  })

  if (!project) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  if (project.ownerId !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const body: unknown = await request.json().catch(() => ({}))
  const email = getEmailFromBody(body)

  if (!email || !isValidCollaboratorEmail(email)) {
    return Response.json({ error: "A valid email is required" }, { status: 400 })
  }

  const existingCollaborator = await prisma.projectCollaborator.findUnique({
    where: {
      projectId_email: {
        projectId,
        email,
      },
    },
  })

  if (!existingCollaborator) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.projectCollaborator.delete({
    where: {
      projectId_email: {
        projectId,
        email,
      },
    },
  })

  return new Response(null, { status: 204 })
}
