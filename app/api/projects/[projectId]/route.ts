import { prisma } from "@/lib/prisma"
import { getCurrentProjectIdentity } from "@/lib/project-access"
import type { NextRequest } from "next/server"

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[projectId]">
) {
  const { userId } = await getCurrentProjectIdentity()
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { projectId } = await ctx.params

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) return Response.json({ error: "Not found" }, { status: 404 })
  if (project.ownerId !== userId) return Response.json({ error: "Forbidden" }, { status: 403 })

  const body: unknown = await request.json().catch(() => ({}))
  const name =
    typeof body === "object" && body !== null && "name" in body && typeof (body as { name: unknown }).name === "string"
      ? (body as { name: string }).name.trim()
      : undefined

  if (!name) return Response.json({ error: "name is required" }, { status: 400 })

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { name },
  })

  return Response.json({ project: updated })
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/projects/[projectId]">
) {
  const { userId } = await getCurrentProjectIdentity()
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { projectId } = await ctx.params

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) return Response.json({ error: "Not found" }, { status: 404 })
  if (project.ownerId !== userId) return Response.json({ error: "Forbidden" }, { status: 403 })

  await prisma.project.delete({ where: { id: projectId } })

  return new Response(null, { status: 204 })
}
