import { getCurrentProjectIdentity, userHasProjectAccess } from "@/lib/project-access"
import { createCanvasDocV1 } from "@/lib/canvas/canvas-doc"
import {
  readCanvasDoc,
  writeCanvasDoc,
  type CanvasDocWriteOptions,
} from "@/lib/canvas/canvas-persistence"
import { applyChildLayerSummaryToParentDoc } from "@/lib/canvas/child-layer-summary"
import {
  createCanvasActivityEvent,
  withCanvasActivity,
} from "@/lib/canvas/canvas-activity"
import { GraphIdError, ROOT_GRAPH_ID, graphIdFromSearchParam } from "@/lib/canvas/graph-ids"
import { sanitizeCanvasSnapshot } from "@/lib/canvas/canvas-state"
import type { NextRequest } from "next/server"

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/projects/[projectId]/canvas">
) {
  const identity = await getCurrentProjectIdentity(_request)
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { projectId } = await ctx.params
  const hasAccess = await userHasProjectAccess(projectId, identity)
  if (!hasAccess) return Response.json({ error: "Not found" }, { status: 404 })

  try {
    const graphId = graphIdFromSearchParam(_request.nextUrl.searchParams.get("graphId"))
    const doc = await readCanvasDoc(projectId, graphId)
    const canvas = doc ? { nodes: doc.nodes, edges: doc.edges } : null
    return Response.json({ canvas, doc })
  } catch (error) {
    if (error instanceof GraphIdError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}

export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[projectId]/canvas">
) {
  const identity = await getCurrentProjectIdentity(request)
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { projectId } = await ctx.params
  const hasAccess = await userHasProjectAccess(projectId, identity)
  if (!hasAccess) return Response.json({ error: "Not found" }, { status: 404 })

  try {
    const graphId = graphIdFromSearchParam(request.nextUrl.searchParams.get("graphId"))
    const body: unknown = await request.json().catch(() => ({}))
    const record = typeof body === "object" && body !== null ? body : {}
    const writeOptions: CanvasDocWriteOptions = {
      graphId,
      parentNodeId:
        "parentNodeId" in record && typeof record.parentNodeId === "string"
          ? record.parentNodeId
          : undefined,
      parentGraphId:
        "parentGraphId" in record && typeof record.parentGraphId === "string"
          ? record.parentGraphId
          : undefined,
      scopeKind:
        "scopeKind" in record && typeof record.scopeKind === "string"
          ? docScopeFromRequest(record.scopeKind, graphId)
          : undefined,
      title:
        "title" in record && typeof record.title === "string"
          ? record.title
          : undefined,
      layer:
        "layer" in record && typeof record.layer === "number" && Number.isInteger(record.layer)
          ? record.layer
          : undefined,
      layerKind:
        "layerKind" in record && typeof record.layerKind === "string"
          ? record.layerKind
          : undefined,
      summary:
        "summary" in record && typeof record.summary === "string"
          ? record.summary
          : undefined,
      panels:
        "panels" in record && typeof record.panels === "object" && record.panels !== null
          ? (record.panels as Record<string, unknown>)
          : undefined,
    }
    const beforeDoc = await readCanvasDoc(projectId, graphId)
    const requestDoc = createCanvasDocV1(sanitizeCanvasSnapshot(body), {
      projectId,
      graphId,
      parentNodeId: writeOptions.parentNodeId,
      parentGraphId: writeOptions.parentGraphId,
      scopeKind:
        writeOptions.scopeKind ??
        (graphId === ROOT_GRAPH_ID ? "system-root" : "architecture-layer"),
      title:
        writeOptions.title ?? (graphId === ROOT_GRAPH_ID ? "System" : "Design layer"),
      layer: writeOptions.layer,
      layerKind: writeOptions.layerKind,
      summary: writeOptions.summary,
      panels: writeOptions.panels,
    })
    const docWithActivity = withCanvasActivity(
      requestDoc,
      createCanvasActivityEvent({
        kind: "manual-save",
        actor: "user",
        beforeDoc,
        afterDoc: requestDoc,
      })
    )
    const { url, doc } = await writeCanvasDoc(projectId, docWithActivity, {
      ...writeOptions,
      panels: docWithActivity.panels,
    })
    let parentGraph = null

    if (doc.parentGraphId && doc.parentNodeId) {
      const existingParent = await readCanvasDoc(projectId, doc.parentGraphId)
      if (existingParent) {
        const nextParent = applyChildLayerSummaryToParentDoc({
          parentDoc: existingParent,
          childDoc: doc,
        })
        if (JSON.stringify(existingParent.nodes) !== JSON.stringify(nextParent.nodes)) {
          const writtenParent = await writeCanvasDoc(projectId, nextParent, {
            graphId: nextParent.graphId,
            parentGraphId: nextParent.parentGraphId,
            parentNodeId: nextParent.parentNodeId,
            scopeKind: nextParent.scopeKind,
            title: nextParent.title,
            layer: nextParent.layer,
            layerKind: nextParent.layerKind,
            summary: nextParent.summary,
            panels: nextParent.panels,
          })
          parentGraph = writtenParent.doc
        }
      }
    }

    return Response.json({ url, doc, parentGraph })
  } catch (error) {
    if (error instanceof GraphIdError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}

function docScopeFromRequest(scopeKind: string, graphId: string) {
  if (graphId === "graph_root") return "system-root" as const
  if (
    scopeKind === "service-internal" ||
    scopeKind === "api-design" ||
    scopeKind === "database-design" ||
    scopeKind === "auth-design" ||
    scopeKind === "worker-design" ||
    scopeKind === "architecture-layer"
  ) {
    return scopeKind
  }
  return graphId === "graph_root" ? "system-root" : "architecture-layer"
}
