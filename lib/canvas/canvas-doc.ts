import type { CanvasEdge, CanvasNode } from "@/types/canvas"
import {
  CANVAS_DOC_VERSION,
  type CanvasSubcanvasScopeKind,
} from "@/types/canvas"
import { ROOT_GRAPH_ID } from "@/lib/canvas/graph-ids"
import {
  type CanvasSnapshot,
  sanitizeCanvasSnapshot,
} from "@/lib/canvas/canvas-state"

export const CANVAS_DOC_SCHEMA_URL =
  "https://arcforge.dev/schemas/canvas-doc.v1.json" as const

export type CanvasScopeKind = "system-root" | CanvasSubcanvasScopeKind

export interface CanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface CanvasDocV1 {
  $schema: typeof CANVAS_DOC_SCHEMA_URL
  docVersion: typeof CANVAS_DOC_VERSION
  projectId: string
  graphId: string
  parentGraphId: string | null
  parentNodeId: string | null
  scopeKind: CanvasScopeKind
  title: string
  layer: number | null
  layerKind: string | null
  summary: string | null
  viewport: CanvasViewport
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  panels: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeLayer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null
}

function normalizeViewport(value: unknown): CanvasViewport {
  if (!isRecord(value)) return { x: 0, y: 0, zoom: 1 }

  return {
    x: typeof value.x === "number" && Number.isFinite(value.x) ? value.x : 0,
    y: typeof value.y === "number" && Number.isFinite(value.y) ? value.y : 0,
    zoom:
      typeof value.zoom === "number" && Number.isFinite(value.zoom)
        ? Math.min(Math.max(value.zoom, 0.1), 4)
        : 1,
  }
}

function normalizeScopeKind(value: unknown): CanvasScopeKind {
  if (
    value === "system-root" ||
    value === "service-internal" ||
    value === "api-design" ||
    value === "database-design" ||
    value === "auth-design" ||
    value === "worker-design" ||
    value === "architecture-layer"
  ) {
    return value
  }

  if (value === "subcanvas") return "service-internal"

  return "system-root"
}

export function createCanvasDocV1(
  snapshot: CanvasSnapshot,
  options: {
    projectId: string
    graphId?: string
    parentGraphId?: string | null
    parentNodeId?: string | null
    scopeKind?: CanvasScopeKind
    title?: string
    layer?: number | null
    layerKind?: string | null
    summary?: string | null
    viewport?: CanvasViewport
    panels?: Record<string, unknown>
  }
): CanvasDocV1 {
  const canvas = sanitizeCanvasSnapshot(snapshot)

  return {
    $schema: CANVAS_DOC_SCHEMA_URL,
    docVersion: CANVAS_DOC_VERSION,
    projectId: options.projectId,
    graphId: options.graphId ?? ROOT_GRAPH_ID,
    parentGraphId: options.parentGraphId ?? null,
    parentNodeId: options.parentNodeId ?? null,
    scopeKind: options.scopeKind ?? "system-root",
    title: options.title ?? "System",
    layer: options.layer ?? null,
    layerKind: options.layerKind ?? null,
    summary: options.summary ?? null,
    viewport: options.viewport ?? { x: 0, y: 0, zoom: 1 },
    nodes: canvas.nodes,
    edges: canvas.edges,
    panels: options.panels ?? {},
  }
}

export function normalizeCanvasDocV1(
  value: unknown,
  options: {
    projectId?: string
    graphId?: string
    scopeKind?: CanvasScopeKind
    title?: string
  } = {}
): CanvasDocV1 {
  const record = isRecord(value) ? value : {}
  const snapshot = sanitizeCanvasSnapshot(value)
  const scopeKind = normalizeScopeKind(record.scopeKind ?? options.scopeKind)

  return createCanvasDocV1(snapshot, {
    projectId: normalizeString(record.projectId, options.projectId ?? ""),
    graphId: normalizeString(record.graphId, options.graphId ?? ROOT_GRAPH_ID),
    parentGraphId: normalizeOptionalString(record.parentGraphId),
    parentNodeId: typeof record.parentNodeId === "string" ? record.parentNodeId : null,
    scopeKind,
    title: normalizeString(record.title, options.title ?? "System"),
    layer: normalizeLayer(record.layer),
    layerKind: normalizeOptionalString(record.layerKind),
    summary: normalizeOptionalString(record.summary),
    viewport: normalizeViewport(record.viewport),
    panels: isRecord(record.panels) ? record.panels : {},
  })
}
