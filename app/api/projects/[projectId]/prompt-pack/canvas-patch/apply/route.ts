import { z } from "zod"
import type { NextRequest } from "next/server"
import { applyLlmCanvasImprovementProposal } from "@/lib/prompt-pack/canvas-patch"
import { GraphIdError, createRealtimeRoomId, graphIdFromSearchParam } from "@/lib/canvas/graph-ids"
import { publishRealtimeRoomEvent } from "@/lib/realtime/server-publish"
import type { JsonValue } from "@/lib/realtime/types"
import { getAccessibleProject, getCurrentProjectIdentity } from "@/lib/project-access"

const AI_USER_ID = "arc-forge-ai"

const ApplyPromptPackCanvasPatchSchema = z.object({
  graphId: z.string().trim().min(1).default("graph_root"),
  proposal: z.unknown(),
})

function toRealtimePayload(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const identity = await getCurrentProjectIdentity(request)
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { projectId } = await ctx.params
  const project = await getAccessibleProject(projectId, identity)
  if (!project) return Response.json({ error: "Not found" }, { status: 404 })

  const body: unknown = await request.json().catch(() => ({}))
  const parsed = ApplyPromptPackCanvasPatchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Invalid Prompt Pack canvas patch request" }, { status: 400 })
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

  const result = await applyLlmCanvasImprovementProposal({
    projectId: project.id,
    currentGraphId: graphId,
    proposal: parsed.data.proposal,
  })
  const currentDoc = result.docs.find((doc) => doc.graphId === graphId)
  let realtimeBroadcasted = false

  if (currentDoc) {
    await publishRealtimeRoomEvent({
      projectId: project.id,
      roomId: createRealtimeRoomId(project.id, graphId),
      userId: AI_USER_ID,
      event: {
        type: "canvas.snapshot",
        payload: toRealtimePayload({
          nodes: currentDoc.nodes,
          edges: currentDoc.edges,
        }),
      },
    })
      .then(() => {
        realtimeBroadcasted = true
      })
      .catch(() => {
        realtimeBroadcasted = false
      })
  }

  return Response.json({
    applied: result.applied,
    issues: result.issues,
    dirtyGraphIds: result.dirtyGraphIds,
    doc: currentDoc ?? null,
    canvas: currentDoc ? { nodes: currentDoc.nodes, edges: currentDoc.edges } : null,
    realtimeBroadcasted,
  })
}
