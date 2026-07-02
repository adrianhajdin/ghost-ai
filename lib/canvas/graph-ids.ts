import type { CanvasNode, CanvasSubcanvasScopeKind } from "@/types/canvas"

export const ROOT_GRAPH_ID = "graph_root" as const

const GRAPH_ID_PATTERN = /^graph_[a-z0-9][a-z0-9_-]{0,113}$/
const MAX_GRAPH_ID_LENGTH = 120
const MAX_REALTIME_ROOM_ID_LENGTH = 240

export class GraphIdError extends Error {
  constructor(message = "Invalid graphId") {
    super(message)
  }
}

export interface ParsedRealtimeRoomId {
  projectId: string
  graphId: string
}

export function isValidGraphId(value: string) {
  return GRAPH_ID_PATTERN.test(value)
}

export function assertValidGraphId(value: string): string {
  const graphId = value.trim()
  if (!isValidGraphId(graphId)) {
    throw new GraphIdError("Invalid graphId")
  }

  return graphId
}

export function graphIdFromSearchParam(value: string | null): string {
  if (!value) return ROOT_GRAPH_ID
  return assertValidGraphId(value)
}

function slugifyGraphPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/-{2,}/g, "-")
}

export function createServiceGraphIdBase(parentNode: CanvasNode): string {
  const rawNodeId = slugifyGraphPart(parentNode.id).replace(/^service[-_]/, "")
  const rawName = slugifyGraphPart(parentNode.data.name ?? parentNode.data.label ?? "")
  const slug = rawNodeId || rawName || "service"
  return truncateGraphId(`graph_service_${slug}`)
}

export function createLayerGraphIdBase(
  parentGraphId: string,
  parentNode: CanvasNode
): string {
  const parentSlug =
    parentGraphId === ROOT_GRAPH_ID
      ? ""
      : slugifyGraphPart(parentGraphId.replace(/^graph_/, ""))
  const rawNodeId = slugifyGraphPart(parentNode.id)
  const rawName = slugifyGraphPart(parentNode.data.name ?? parentNode.data.label ?? "")
  const nodeSlug = rawName || rawNodeId || "layer"
  const scopedSlug = parentSlug ? `${parentSlug}_${nodeSlug}` : nodeSlug

  return truncateGraphId(`graph_${scopedSlug}`)
}

export function truncateGraphId(value: string) {
  return value.length > MAX_GRAPH_ID_LENGTH
    ? value.slice(0, MAX_GRAPH_ID_LENGTH).replace(/[-_]+$/g, "")
    : value
}

export function appendGraphIdSuffix(baseGraphId: string, suffix: string) {
  const cleanSuffix = slugifyGraphPart(suffix)
  const suffixPart = cleanSuffix ? `_${cleanSuffix}` : ""
  const maxBaseLength = MAX_GRAPH_ID_LENGTH - suffixPart.length
  return `${baseGraphId.slice(0, maxBaseLength).replace(/[-_]+$/g, "")}${suffixPart}`
}

export function subcanvasScopeForNode(
  semanticType: string | undefined
): CanvasSubcanvasScopeKind | null {
  if (semanticType === "service") return "service-internal"
  if (semanticType === "api") return "api-design"
  if (semanticType === "database") return "database-design"
  if (semanticType === "auth-module") return "auth-design"
  if (semanticType === "worker") return "worker-design"
  return null
}

export function createRealtimeRoomId(projectId: string, graphId: string = ROOT_GRAPH_ID) {
  const scopedGraphId = assertValidGraphId(graphId)
  const roomId = `${projectId}:${scopedGraphId}`
  if (roomId.length > MAX_REALTIME_ROOM_ID_LENGTH) {
    throw new GraphIdError("Realtime room id is too long")
  }
  return roomId
}

export function parseRealtimeRoomId(roomId: string): ParsedRealtimeRoomId {
  const normalized = roomId.trim()
  if (!normalized || normalized.length > MAX_REALTIME_ROOM_ID_LENGTH) {
    throw new GraphIdError("Invalid realtime room")
  }

  const separatorIndex = normalized.lastIndexOf(":")
  if (separatorIndex === -1) {
    return {
      projectId: normalized,
      graphId: ROOT_GRAPH_ID,
    }
  }

  const projectId = normalized.slice(0, separatorIndex).trim()
  const graphId = assertValidGraphId(normalized.slice(separatorIndex + 1))

  if (!projectId) {
    throw new GraphIdError("Invalid realtime room")
  }

  return { projectId, graphId }
}
