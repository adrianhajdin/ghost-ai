import { z } from "zod"
import { AiTaskType } from "@/app/generated/prisma/client"
import { createAiTaskRun } from "@/lib/ai-tasks/task-service"
import {
  LLM_PROMPT_PACK_SCOPE_MODES,
  LLM_PROMPT_PACK_TARGET_AGENTS,
} from "@/lib/prompt-pack/llm-prompt-pack"
import { ROOT_GRAPH_ID, GraphIdError, graphIdFromSearchParam } from "@/lib/canvas/graph-ids"
import { getAccessibleProject, getCurrentProjectIdentity } from "@/lib/project-access"

const PromptPackRequestSchema = z.object({
  projectId: z.string().trim().min(1),
  graphId: z.string().trim().min(1).default(ROOT_GRAPH_ID),
  targetAgent: z.enum(LLM_PROMPT_PACK_TARGET_AGENTS),
  scopeMode: z.enum(LLM_PROMPT_PACK_SCOPE_MODES),
  selectedNodeIds: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  instructions: z.string().trim().max(4000).optional(),
})

export async function POST(request: Request) {
  const identity = await getCurrentProjectIdentity(request)
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body: unknown = await request.json().catch(() => ({}))
  const parsed = PromptPackRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Invalid Prompt Pack request" }, { status: 400 })
  }

  const project = await getAccessibleProject(parsed.data.projectId, identity)
  if (!project) return Response.json({ error: "Not found" }, { status: 404 })

  if (parsed.data.scopeMode === "selected-nodes" && parsed.data.selectedNodeIds.length === 0) {
    return Response.json(
      { error: "Select at least one node before generating a selected-node Prompt Pack." },
      { status: 400 }
    )
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
    type: AiTaskType.prompt_pack,
    projectId: project.id,
    userId: identity.userId,
    payloadJson: {
      projectId: project.id,
      projectName: project.name,
      graphId,
      userId: identity.userId,
      targetAgent: parsed.data.targetAgent,
      scopeMode: parsed.data.scopeMode,
      selectedNodeIds: parsed.data.selectedNodeIds,
      instructions: parsed.data.instructions,
    },
  })

  return Response.json({ runId: run.id }, { status: 201 })
}
