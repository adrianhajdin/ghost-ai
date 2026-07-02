import { prisma } from "@/lib/prisma"
import {
  type CanvasSnapshot,
  emptyCanvasSnapshot,
  sanitizeCanvasSnapshot,
  serializeCanvasSnapshot,
} from "@/lib/canvas/canvas-state"
import {
  createCanvasDocV1,
  normalizeCanvasDocV1,
  type CanvasDocV1,
  type CanvasScopeKind,
} from "@/lib/canvas/canvas-doc"
import { ROOT_GRAPH_ID, assertValidGraphId } from "@/lib/canvas/graph-ids"
import {
  canvasGraphObjectPath,
  canvasSnapshotObjectPath,
} from "@/lib/storage/paths"
import { getStorageProvider } from "@/lib/storage/storage-provider"

export interface CanvasDocWriteOptions {
  graphId?: string
  parentGraphId?: string | null
  parentNodeId?: string | null
  scopeKind?: CanvasScopeKind
  title?: string
  layer?: number | null
  layerKind?: string | null
  summary?: string | null
}

function canvasFromDoc(doc: CanvasDocV1): CanvasSnapshot {
  return {
    nodes: doc.nodes,
    edges: doc.edges,
  }
}

function graphObjectPath(projectId: string, graphId: string) {
  const safeGraphId = assertValidGraphId(graphId)
  return safeGraphId === ROOT_GRAPH_ID
    ? canvasSnapshotObjectPath(projectId)
    : canvasGraphObjectPath(projectId, safeGraphId)
}

async function readJson(reference: string) {
  return getStorageProvider().readJsonObject(reference).catch(() => null)
}

export async function readCanvasSnapshot(projectId: string): Promise<CanvasSnapshot | null> {
  const doc = await readCanvasDoc(projectId, ROOT_GRAPH_ID)
  return doc ? canvasFromDoc(doc) : null
}

export async function readCanvasDoc(
  projectId: string,
  graphId: string = ROOT_GRAPH_ID
): Promise<CanvasDocV1 | null> {
  const safeGraphId = assertValidGraphId(graphId)

  if (safeGraphId !== ROOT_GRAPH_ID) {
    const canvas = await readJson(canvasGraphObjectPath(projectId, safeGraphId))
    return canvas
      ? normalizeCanvasDocV1(canvas, {
          projectId,
          graphId: safeGraphId,
          scopeKind: "architecture-layer",
          title: "Design layer",
        })
      : null
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { canvasBlobUrl: true },
  })

  if (!project?.canvasBlobUrl) return null

  const canvas = await readJson(project.canvasBlobUrl)
  return canvas
    ? normalizeCanvasDocV1(canvas, {
        projectId,
        graphId: ROOT_GRAPH_ID,
        scopeKind: "system-root",
        title: "System",
      })
    : createCanvasDocV1(emptyCanvasSnapshot(), { projectId })
}

export async function writeCanvasSnapshot(
  projectId: string,
  snapshot: CanvasSnapshot
) {
  const doc = createCanvasDocV1(serializeCanvasSnapshot(snapshot), { projectId })
  const { reference } = await writeCanvasDoc(projectId, doc)
  const canvas = canvasFromDoc(doc)

  return { url: reference, reference, canvas }
}

export async function writeCanvasDoc(
  projectId: string,
  value: CanvasSnapshot | CanvasDocV1,
  options: CanvasDocWriteOptions = {}
) {
  const graphId = assertValidGraphId(options.graphId ?? ("graphId" in value ? value.graphId : ROOT_GRAPH_ID))
  const existingDoc = "docVersion" in value
  const doc = existingDoc
    ? normalizeCanvasDocV1(value, { projectId })
    : createCanvasDocV1(sanitizeCanvasSnapshot(value), {
        projectId,
        graphId,
        parentGraphId: options.parentGraphId ?? null,
        parentNodeId: options.parentNodeId ?? null,
        scopeKind: options.scopeKind ?? (graphId === ROOT_GRAPH_ID ? "system-root" : "architecture-layer"),
        title: options.title ?? (graphId === ROOT_GRAPH_ID ? "System" : "Design layer"),
        layer: options.layer ?? null,
        layerKind: options.layerKind ?? null,
        summary: options.summary ?? null,
      })

  const nextDoc: CanvasDocV1 = {
    ...doc,
    projectId,
    graphId,
    parentGraphId: options.parentGraphId ?? doc.parentGraphId,
    parentNodeId: options.parentNodeId ?? doc.parentNodeId,
    scopeKind: options.scopeKind ?? doc.scopeKind,
    title: options.title ?? doc.title,
    layer: options.layer ?? doc.layer,
    layerKind: options.layerKind ?? doc.layerKind,
    summary: options.summary ?? doc.summary,
  }
  const reference = await getStorageProvider().writeJsonObject(
    graphObjectPath(projectId, graphId),
    nextDoc,
    {
      contentType: "application/json",
    }
  )

  if (graphId === ROOT_GRAPH_ID) {
    await prisma.project.update({
      where: { id: projectId },
      data: { canvasBlobUrl: reference },
    })
  }

  return { url: reference, reference, doc: nextDoc, canvas: canvasFromDoc(nextDoc) }
}

export async function canvasGraphExists(projectId: string, graphId: string) {
  const safeGraphId = assertValidGraphId(graphId)

  if (safeGraphId === ROOT_GRAPH_ID) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { canvasBlobUrl: true },
    })
    return Boolean(project?.canvasBlobUrl)
  }

  const canvas = await readJson(canvasGraphObjectPath(projectId, safeGraphId))
  return Boolean(canvas)
}
