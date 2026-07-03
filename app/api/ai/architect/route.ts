import { z } from "zod"
import { AiTaskType } from "@/app/generated/prisma/client"
import { createAiTaskRun } from "@/lib/ai-tasks/task-service"
import { createArchitectConversationMessage } from "@/lib/ai/architect/architect-conversation-store"
import { ROOT_GRAPH_ID, GraphIdError, graphIdFromSearchParam } from "@/lib/canvas/graph-ids"
import { getAccessibleProject, getCurrentProjectIdentity } from "@/lib/project-access"

const ArchitectRequestSchema = z.object({
  projectId: z.string().trim().min(1),
  graphId: z.string().trim().min(1).default(ROOT_GRAPH_ID),
  message: z.string().trim().min(1).max(8000),
  selectedNodeIds: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  conversationId: z.string().trim().min(1).max(120).optional(),
  recentMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().max(8000),
        createdAt: z.string().trim().optional(),
      })
    )
    .max(20)
    .optional(),
})

export async function POST(request: Request) {
  const identity = await getCurrentProjectIdentity(request)
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body: unknown = await request.json().catch(() => ({}))
  const parsed = ArchitectRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Invalid Architect request" }, { status: 400 })
  }

  const project = await getAccessibleProject(parsed.data.projectId, identity)
  if (!project) return Response.json({ error: "Not found" }, { status: 404 })

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
    type: AiTaskType.architect_conversation,
    projectId: project.id,
    userId: identity.userId,
    payloadJson: {
      projectId: project.id,
      projectName: project.name,
      graphId,
      userId: identity.userId,
      userMessage: parsed.data.message,
      selectedNodeIds: parsed.data.selectedNodeIds,
    },
  })

  const userMessage = await createArchitectConversationMessage({
    projectId: project.id,
    graphId,
    userId: identity.userId,
    role: "user",
    content: parsed.data.message,
    linkedRunId: run.id,
    metadata: {
      selectedNodeIds: parsed.data.selectedNodeIds,
    },
  })

  return Response.json({ runId: run.id, userMessage }, { status: 201 })
}
