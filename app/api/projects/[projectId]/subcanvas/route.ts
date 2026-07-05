import { z } from "zod"
import { getCurrentProjectIdentity, userHasProjectAccess } from "@/lib/project-access"
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
  graphIdFromSearchParam,
} from "@/lib/canvas/graph-ids"
import { createCanvasDocV1, type CanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { emptyCanvasSnapshot } from "@/lib/canvas/canvas-state"
import { childLayerMetadataPatch } from "@/lib/canvas/child-layer-summary"
import type { CanvasNode } from "@/types/canvas"
import type { NextRequest } from "next/server"

const CreateSubcanvasSchema = z.object({
  parentGraphId: z.string().trim().min(1).max(120).default(ROOT_GRAPH_ID),
  parentNodeId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(240).optional(),
  layerKind: z.string().trim().min(1).max(120).optional(),
  summary: z.string().trim().max(2000).optional(),
})

async function uniqueGraphId(
  projectId: string,
  parentGraphId: string,
  parentNode: CanvasNode
) {
  const baseGraphId = createLayerGraphIdBase(parentGraphId, parentNode)
  for (let index = 0; index < 20; index += 1) {
    const candidate =
      index === 0 ? baseGraphId : appendGraphIdSuffix(baseGraphId, String(index + 1))
    const exists = await canvasGraphExists(projectId, candidate)
    if (!exists) return candidate
  }

  return appendGraphIdSuffix(baseGraphId, Math.random().toString(36).slice(2, 8))
}

function docLayer(parentDoc: CanvasDocV1) {
  if (typeof parentDoc.layer === "number") return parentDoc.layer + 1
  return parentDoc.graphId === ROOT_GRAPH_ID ? 1 : 1
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

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[projectId]/subcanvas">
) {
  const identity = await getCurrentProjectIdentity(request)
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { projectId } = await ctx.params
  const hasAccess = await userHasProjectAccess(projectId, identity)
  if (!hasAccess) return Response.json({ error: "Not found" }, { status: 404 })

  const body: unknown = await request.json().catch(() => ({}))
  const parsed = CreateSubcanvasSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Invalid subcanvas request" }, { status: 400 })
  }

  let parentGraphId: string
  try {
    parentGraphId = graphIdFromSearchParam(parsed.data.parentGraphId)
  } catch (error) {
    if (error instanceof GraphIdError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    throw error
  }

  const parentDoc =
    (await readCanvasDoc(projectId, parentGraphId)) ??
    (parentGraphId === ROOT_GRAPH_ID
      ? createCanvasDocV1(emptyCanvasSnapshot(), { projectId })
      : null)

  if (!parentDoc) {
    return Response.json({ error: "Parent graph not found" }, { status: 404 })
  }

  const parentNode = parentDoc.nodes.find((node) => node.id === parsed.data.parentNodeId)
  if (!parentNode) {
    return Response.json({ error: "Parent node not found" }, { status: 404 })
  }

  if (parentNode.data.subcanvasRef?.graphId) {
    const existingRef = parentNode.data.subcanvasRef
    return Response.json({
      subcanvasRef: existingRef,
      parentGraph: parentDoc,
      childGraph: await readCanvasDoc(projectId, existingRef.graphId),
    })
  }

  const now = new Date().toISOString()
  const graphId = await uniqueGraphId(projectId, parentGraphId, parentNode)
  const nodeTitle = parentNode.data.name?.trim() || parentNode.data.label?.trim() || parentNode.id
  const title = parsed.data.title ?? `${nodeTitle} Layer`
  const layer = docLayer(parentDoc)
  const layerKind = parsed.data.layerKind ?? "architecture-layer"
  const summary = parsed.data.summary?.trim() || parentNode.data.description?.trim() || null
  const subcanvasRef = {
    graphId,
    scopeKind: "architecture-layer" as const,
    title,
    parentGraphId,
    parentNodeId: parentNode.id,
    layer,
    layerKind,
    summary: summary ?? undefined,
    createdAt: now,
    updatedAt: now,
    llmLayerPurpose: summary ?? undefined,
  }
  const childGraph = createCanvasDocV1(emptyCanvasSnapshot(), {
    projectId,
    graphId,
    parentGraphId,
    parentNodeId: parentNode.id,
    scopeKind: "architecture-layer",
    title,
    layer,
    layerKind,
    summary,
  })
  const layerMetadata = childLayerMetadataPatch({
    childDoc: childGraph,
    existingParentNode: parentNode,
    authoredSummary: summary,
    now,
  })
  const nextParentDoc = {
    ...parentDoc,
    nodes: parentDoc.nodes.map((node) =>
      node.id === parentNode.id
        ? {
            ...node,
            data: {
              ...node.data,
              subcanvasRef,
              ...layerMetadata,
            },
          }
        : node
    ),
  }

  await writeCanvasDoc(projectId, childGraph, {
    graphId,
    parentGraphId,
    parentNodeId: parentNode.id,
    scopeKind: "architecture-layer",
    title,
    layer,
    layerKind,
    summary,
  })
  const { doc: parentGraph } = await writeCanvasDoc(
    projectId,
    nextParentDoc,
    writeOptionsForDoc(parentDoc)
  )

  return Response.json(
    {
      subcanvasRef,
      parentGraph,
      childGraph,
    },
    { status: 201 }
  )
}
