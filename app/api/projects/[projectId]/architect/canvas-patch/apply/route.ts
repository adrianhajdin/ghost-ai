import { z } from "zod"
import type { NextRequest } from "next/server"
import { applyLlmCanvasImprovementProposal } from "@/lib/canvas/llm-canvas-patch"
import { GraphIdError, createRealtimeRoomId, graphIdFromSearchParam } from "@/lib/canvas/graph-ids"
import { publishRealtimeRoomEvent } from "@/lib/realtime/server-publish"
import type { JsonValue } from "@/lib/realtime/types"
import { getAccessibleProject, getCurrentProjectIdentity } from "@/lib/project-access"

const AI_USER_ID = "arc-forge-ai"

const ApplyArchitectCanvasPatchSchema = z.object({
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
  const parsed = ApplyArchitectCanvasPatchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Invalid Architect canvas patch request" }, { status: 400 })
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
  const broadcastedGraphIds: string[] = []
  const realtimeBroadcastFailures: string[] = []

  for (const doc of result.docs) {
    await publishRealtimeRoomEvent({
      projectId: project.id,
      roomId: createRealtimeRoomId(project.id, doc.graphId),
      userId: AI_USER_ID,
      event: {
        type: "canvas.snapshot",
        payload: toRealtimePayload({
          nodes: doc.nodes,
          edges: doc.edges,
        }),
      },
    })
      .then(() => {
        broadcastedGraphIds.push(doc.graphId)
      })
      .catch(() => {
        realtimeBroadcastFailures.push(doc.graphId)
      })
  }

  return Response.json({
    applied: result.applied,
    issues: result.issues,
    dirtyGraphIds: result.dirtyGraphIds,
    doc: currentDoc ?? null,
    canvas: currentDoc ? { nodes: currentDoc.nodes, edges: currentDoc.edges } : null,
    realtimeBroadcasted: broadcastedGraphIds.length > 0,
    broadcastedGraphIds,
    realtimeBroadcastFailures,
  })
}
