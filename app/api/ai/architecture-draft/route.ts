import { z } from "zod"
import { AiTaskType } from "@/app/generated/prisma/client"
import { createAiTaskRun } from "@/lib/ai-tasks/task-service"
import { ArchitectureDraftComplexitySchema } from "@/lib/architecture-draft/architecture-draft"
import { ROOT_GRAPH_ID, GraphIdError, graphIdFromSearchParam } from "@/lib/canvas/graph-ids"
import { getAccessibleProject, getCurrentProjectIdentity } from "@/lib/project-access"

const ArchitectureDraftRequestSchema = z.object({
  prompt: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  graphId: z.string().trim().min(1).default(ROOT_GRAPH_ID),
  complexity: ArchitectureDraftComplexitySchema.default("standard"),
})

export async function POST(request: Request) {
  const identity = await getCurrentProjectIdentity(request)
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body: unknown = await request.json().catch(() => ({}))
  const parsed = ArchitectureDraftRequestSchema.safeParse(body)

  if (!parsed.success) {
    return Response.json({ error: "Missing required fields" }, { status: 400 })
  }

  const project = await getAccessibleProject(parsed.data.projectId, identity)
  if (!project) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  let graphId: string
  try {
    graphId = graphIdFromSearchParam(parsed.data.graphId)
  } catch (error) {
    if (error instanceof GraphIdError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    throw error
  }

  const run = await createAiTaskRun({
    type: AiTaskType.architecture_draft,
    projectId: project.id,
    userId: identity.userId,
    payloadJson: {
      prompt: parsed.data.prompt,
      projectId: project.id,
      graphId,
      userId: identity.userId,
      complexity: parsed.data.complexity,
    },
  })

  return Response.json({ runId: run.id }, { status: 201 })
}
