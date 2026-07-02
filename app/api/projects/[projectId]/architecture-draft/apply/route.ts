import { z } from "zod"
import {
  applyArchitectureDraftGraphToCanvasDoc,
  applyArchitectureDraftProposalToCanvasDoc,
  architectureDraftHasErrors,
  getArchitectureDraftGraphs,
  parseArchitectureDraftProposal,
  sanitizeArchitectureDraftProposal,
  validateArchitectureDraftProposal,
  type ArchitectureDraftGraph,
  type ArchitectureDraftValidationResult,
} from "@/lib/architecture-draft/architecture-draft"
import { createCanvasDocV1, type CanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { emptyCanvasSnapshot } from "@/lib/canvas/canvas-state"
import {
  canvasGraphExists,
  readCanvasDoc,
  writeCanvasDoc,
} from "@/lib/canvas/canvas-persistence"
import {
  GraphIdError,
  ROOT_GRAPH_ID,
  appendGraphIdSuffix,
  createLayerGraphIdBase,
  createRealtimeRoomId,
  graphIdFromSearchParam,
  isValidGraphId,
} from "@/lib/canvas/graph-ids"
import { publishRealtimeRoomEvent } from "@/lib/realtime/server-publish"
import type { JsonValue } from "@/lib/realtime/types"
import { getAccessibleProject, getCurrentProjectIdentity } from "@/lib/project-access"
import type { CanvasNode } from "@/types/canvas"
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

function writeOptionsForDoc(doc: CanvasDocV1) {
  return {
    graphId: doc.graphId,
    parentGraphId: doc.parentGraphId,
    parentNodeId: doc.parentNodeId,
    scopeKind: doc.scopeKind,
    title: doc.title,
    layer: doc.layer,
    layerKind: doc.layerKind,
    summary: doc.summary,
  }
}

async function uniqueGraphId(
  projectId: string,
  parentGraphId: string,
  parentNode: CanvasNode,
  requestedGraphId?: string
) {
  if (requestedGraphId && isValidGraphId(requestedGraphId)) {
    const exists = await canvasGraphExists(projectId, requestedGraphId)
    if (!exists) return requestedGraphId
  }

  const baseGraphId = requestedGraphId && isValidGraphId(requestedGraphId)
    ? requestedGraphId
    : createLayerGraphIdBase(parentGraphId, parentNode)
  for (let index = 0; index < 20; index += 1) {
    const candidate =
      index === 0 ? baseGraphId : appendGraphIdSuffix(baseGraphId, String(index + 1))
    const exists = await canvasGraphExists(projectId, candidate)
    if (!exists) return candidate
  }

  return appendGraphIdSuffix(baseGraphId, Math.random().toString(36).slice(2, 8))
}

function applyIssue(
  graph: ArchitectureDraftGraph,
  message: string
): ArchitectureDraftValidationResult {
  return {
    id: `graph-${graph.graphId ?? "layer"}-apply-issue`,
    severity: "warning",
    targetKind: "graph",
    targetId: graph.graphId,
    message,
  }
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

  const currentDoc =
    (await readCanvasDoc(project.id, graphId)) ??
    createCanvasDocV1(emptyCanvasSnapshot(), {
      projectId: project.id,
      graphId,
      title: project.name,
      scopeKind: graphId === ROOT_GRAPH_ID ? "system-root" : "architecture-layer",
    })

  const validation = validateArchitectureDraftProposal(parsed.data.proposal, {
    targetGraphId: graphId,
    existingCanvas: { nodes: currentDoc.nodes, edges: currentDoc.edges },
  })
  if (architectureDraftHasErrors(validation)) {
    return Response.json(
      {
        error: "Architecture draft safety checks failed",
        validation,
      },
      { status: 400 }
    )
  }

  const proposal = sanitizeArchitectureDraftProposal(
    parseArchitectureDraftProposal(parsed.data.proposal)
  )
  const graphs = getArchitectureDraftGraphs(proposal)
  const activeGraph =
    graphs.find((graph) => graph.graphId === graphId) ??
    (proposal.targetGraphId === graphId
      ? {
          graphId,
          title: proposal.title,
          summary: proposal.summary,
          nodes: proposal.nodes,
          edges: proposal.edges,
        }
      : null)
  const activeApplyResult = activeGraph
    ? applyArchitectureDraftGraphToCanvasDoc(currentDoc, proposal, activeGraph)
    : applyArchitectureDraftProposalToCanvasDoc(currentDoc, proposal)

  if (!activeApplyResult.ok || architectureDraftHasErrors(activeApplyResult.validation)) {
    return Response.json(
      {
        error: "Architecture draft safety checks failed",
        validation: activeApplyResult.validation,
      },
      { status: 400 }
    )
  }

  const docsByGraphId = new Map<string, CanvasDocV1>([
    [graphId, activeApplyResult.doc],
  ])
  const idMapsByGraphId = new Map<string, Record<string, string>>([
    [graphId, activeApplyResult.idMap],
  ])
  const dirtyGraphIds = new Set<string>([graphId])
  const applyIssues: ArchitectureDraftValidationResult[] = []
  const childGraphIds: string[] = []

  for (const graph of graphs
    .filter((candidate) => candidate.graphId !== graphId)
    .sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0))) {
    const parentGraphId = graph.parentGraphId ?? graphId
    let parentDoc =
      docsByGraphId.get(parentGraphId) ?? (await readCanvasDoc(project.id, parentGraphId))

    if (!parentDoc) {
      applyIssues.push(applyIssue(graph, `Child layer skipped because parent graph was not found: ${parentGraphId}.`))
      continue
    }

    const mappedParentNodeId = graph.parentNodeTempId
      ? idMapsByGraphId.get(parentGraphId)?.[graph.parentNodeTempId] ?? graph.parentNodeTempId
      : graph.parentNodeId ?? null
    const parentNode = mappedParentNodeId
      ? parentDoc.nodes.find((node) => node.id === mappedParentNodeId)
      : null

    if (!parentNode) {
      applyIssues.push(applyIssue(graph, "Child layer skipped because its parent node could not be resolved."))
      continue
    }

    const existingChildGraphId = parentNode.data.subcanvasRef?.graphId
    const childGraphId =
      existingChildGraphId ??
      (await uniqueGraphId(project.id, parentGraphId, parentNode, graph.graphId))
    const childLayer =
      graph.layer ??
      (typeof parentDoc.layer === "number" ? parentDoc.layer + 1 : parentGraphId === ROOT_GRAPH_ID ? 1 : 1)
    const childTitle =
      graph.title ??
      parentNode.data.name?.trim() ??
      parentNode.data.label?.trim() ??
      "Design layer"
    const childSummary = graph.summary ?? null
    const childDoc =
      (await readCanvasDoc(project.id, childGraphId)) ??
      createCanvasDocV1(emptyCanvasSnapshot(), {
        projectId: project.id,
        graphId: childGraphId,
        parentGraphId,
        parentNodeId: parentNode.id,
        scopeKind: "architecture-layer",
        title: childTitle,
        layer: childLayer,
        layerKind: graph.layerKind ?? "architecture-layer",
        summary: childSummary,
      })
    const childApplyResult = applyArchitectureDraftGraphToCanvasDoc(
      childDoc,
      proposal,
      {
        ...graph,
        graphId: childGraphId,
        title: childTitle,
        layer: childLayer,
        summary: childSummary ?? undefined,
      }
    )

    if (!childApplyResult.ok) {
      applyIssues.push(
        applyIssue(graph, "Child layer skipped because its transport checks failed.")
      )
      continue
    }

    const now = new Date().toISOString()
    const subcanvasRef = {
      graphId: childGraphId,
      scopeKind: "architecture-layer" as const,
      title: childTitle,
      parentGraphId,
      parentNodeId: parentNode.id,
      layer: childLayer,
      layerKind: graph.layerKind ?? "architecture-layer",
      summary: childSummary ?? undefined,
      createdAt: parentNode.data.subcanvasRef?.createdAt ?? now,
      updatedAt: now,
      llmLayerPurpose: childSummary ?? undefined,
    }

    parentDoc = {
      ...parentDoc,
      nodes: parentDoc.nodes.map((node) =>
        node.id === parentNode.id
          ? { ...node, data: { ...node.data, subcanvasRef } }
          : node
      ),
    }

    docsByGraphId.set(parentGraphId, parentDoc)
    docsByGraphId.set(childGraphId, {
      ...childApplyResult.doc,
      graphId: childGraphId,
      parentGraphId,
      parentNodeId: parentNode.id,
      scopeKind: "architecture-layer",
      title: childTitle,
      layer: childLayer,
      layerKind: graph.layerKind ?? childApplyResult.doc.layerKind,
      summary: childSummary ?? childApplyResult.doc.summary,
    })
    idMapsByGraphId.set(childGraphId, childApplyResult.idMap)
    dirtyGraphIds.add(parentGraphId)
    dirtyGraphIds.add(childGraphId)
    childGraphIds.push(childGraphId)
  }

  const writeResults = new Map<string, CanvasDocV1>()
  for (const dirtyGraphId of dirtyGraphIds) {
    const dirtyDoc = docsByGraphId.get(dirtyGraphId)
    if (!dirtyDoc) continue
    const { doc } = await writeCanvasDoc(
      project.id,
      dirtyDoc,
      writeOptionsForDoc(dirtyDoc)
    )
    writeResults.set(dirtyGraphId, doc)
  }

  const doc = writeResults.get(graphId) ?? docsByGraphId.get(graphId) ?? activeApplyResult.doc

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
    validation: [...activeApplyResult.validation, ...applyIssues],
    applied: {
      nodes: activeApplyResult.appliedNodes,
      edges: activeApplyResult.appliedEdges,
      idMap: activeApplyResult.idMap,
      childGraphs: childGraphIds.length,
      childGraphIds,
      skippedGraphs: applyIssues.length,
    },
    realtimeBroadcasted,
  })
}
