import { prisma } from "@/lib/prisma"
import { tasks } from "@trigger.dev/sdk"
import { getCurrentProjectIdentity, getAccessibleProject } from "@/lib/project-access"
import type { generateSpec } from "@/trigger/generate-spec"
import { specRequestSchema } from "@/lib/ai-schemas"
import { getProjectAiProviderConfig } from "@/lib/ai-provider-config"

export async function POST(request: Request) {
  const identity = await getCurrentProjectIdentity()
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = specRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }

  const project = await getAccessibleProject(parsed.data.roomId, identity)
  if (!project) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  if (parsed.data.providerConfigId) {
    const providerConfig = await getProjectAiProviderConfig(
      project.id,
      parsed.data.providerConfigId
    )
    if (!providerConfig) {
      return Response.json({ error: "AI provider configuration not found" }, { status: 404 })
    }
  }

  const handle = await tasks.trigger<typeof generateSpec>("generate-spec", {
    projectId: project.id,
    ...parsed.data,
  })

  await prisma.taskRun.create({
    data: { runId: handle.id, projectId: project.id, userId: identity.userId },
  })

  return Response.json({ runId: handle.id }, { status: 201 })
}
