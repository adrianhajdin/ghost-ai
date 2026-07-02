import { z } from "zod"
import {
  applyArchitectureDraftProposalToCanvasDoc,
  architectureDraftHasErrors,
} from "@/lib/architecture-draft/architecture-draft"
import { createCanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { emptyCanvasSnapshot } from "@/lib/canvas/canvas-state"
import { readCanvasDoc, writeCanvasDoc } from "@/lib/canvas/canvas-persistence"
import {
  GraphIdError,
  ROOT_GRAPH_ID,
  createRealtimeRoomId,
  graphIdFromSearchParam,
} from "@/lib/canvas/graph-ids"
import { publishRealtimeRoomEvent } from "@/lib/realtime/server-publish"
import type { JsonValue } from "@/lib/realtime/types"
import { getAccessibleProject, getCurrentProjectIdentity } from "@/lib/project-access"
import type { NextRequest } from "next/server"

const AI_USER_ID = "arc-forge-ai"

const ApplyArchitectureDraftSchema = z.object({
  graphId: z.string().trim().min(1).default(ROOT_GRAPH_ID),
  mode: z.literal("append").default("append"),
  proposal: z.unknown(),
})

function toRealtimePayload(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[projectId]/architecture-draft/apply">
) {
  const identity = await getCurrentProjectIdentity(request)
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { projectId } = await ctx.params
  const project = await getAccessibleProject(projectId, identity)
  if (!project) return Response.json({ error: "Not found" }, { status: 404 })

  const body: unknown = await request.json().catch(() => ({}))
  const parsed = ApplyArchitectureDraftSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Invalid architecture draft apply request" }, { status: 400 })
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

  if (graphId !== ROOT_GRAPH_ID) {
    return Response.json(
      { error: "Architecture Draft v1 only supports graph_root" },
      { status: 400 }
    )
  }

  const currentDoc =
    (await readCanvasDoc(project.id, graphId)) ??
    createCanvasDocV1(emptyCanvasSnapshot(), {
      projectId: project.id,
      title: project.name,
    })

  const applyResult = applyArchitectureDraftProposalToCanvasDoc(
    currentDoc,
    parsed.data.proposal
  )

  if (!applyResult.ok || architectureDraftHasErrors(applyResult.validation)) {
    return Response.json(
      {
        error: "Architecture draft validation failed",
        validation: applyResult.validation,
      },
      { status: 400 }
    )
  }

  const { doc } = await writeCanvasDoc(project.id, applyResult.doc, {
    graphId,
    scopeKind: "system-root",
    title: currentDoc.title,
  })

  let realtimeBroadcasted = true
  await publishRealtimeRoomEvent({
    projectId: project.id,
    roomId: createRealtimeRoomId(project.id, graphId),
    userId: AI_USER_ID,
    event: {
      type: "canvas.snapshot",
      payload: toRealtimePayload({ nodes: doc.nodes, edges: doc.edges }),
    },
  }).catch(() => {
    realtimeBroadcasted = false
  })

  return Response.json({
    doc,
    canvas: { nodes: doc.nodes, edges: doc.edges },
    validation: applyResult.validation,
    applied: {
      nodes: applyResult.appliedNodes,
      edges: applyResult.appliedEdges,
      idMap: applyResult.idMap,
    },
    realtimeBroadcasted,
  })
}
