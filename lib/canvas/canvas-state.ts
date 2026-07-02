import { z } from "zod"
import type { CanvasEdge, CanvasNode } from "@/types/canvas"
import {
  NODE_COLORS,
  NODE_SHAPES,
  SEMANTIC_EDGE_TYPES,
  SEMANTIC_NODE_TYPES,
  SHAPE_DEFAULTS,
  isSemanticEdgeType,
  isSemanticNodeType,
  type CanvasMetadataStatus,
  type CanvasNodeData,
  type NodeShape,
} from "@/types/canvas"
import { mirrorEdgeLabelData, normalizeEdgeLabelItems } from "@/lib/canvas/edge-labels"
import {
  looksLikeRawSecretValue,
  shouldStripSecretField,
} from "@/lib/canvas/secret-guards"

export interface CanvasSnapshot {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

const TRANSIENT_FIELD_KEYS = new Set([
  "selected",
  "dragging",
  "resizing",
  "hovered",
  "isEditing",
  "draft",
  "draftText",
  "draftLabel",
  "activeToolbar",
  "openPopover",
  "lassoRectangle",
  "temporaryReconnectLine",
  "presence",
  "cursor",
  "cursors",
])

const metadataStatusSchema = z
  .enum(["draft", "approved", "deprecated"])
  .optional()

const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

const nodeDataSchema = z
  .object({
    label: z.string().max(240).default(""),
    semanticType: z.string().max(80).optional(),
    name: z.string().max(240).optional(),
    description: z.string().max(4000).optional(),
    tags: z.array(z.string().max(80)).max(24).optional(),
    status: metadataStatusSchema,
    sourceRefs: z.array(z.string().max(240)).max(32).optional(),
    assumptions: z.array(z.string().max(500)).max(32).optional(),
    decisionRefs: z.array(z.string().max(240)).max(32).optional(),
    owner: z.string().max(240).nullable().optional(),
    createdAt: z.string().max(80).optional(),
    updatedAt: z.string().max(80).optional(),
    color: z.string().max(80).optional(),
    textColor: z.string().max(80).optional(),
    shape: z.string().max(80).optional(),
    subcanvasRef: z
      .object({
        graphId: z.string().trim().min(1).max(120),
        scopeKind: z.string().trim().max(80).optional(),
        title: z.string().max(240).optional(),
        parentGraphId: z.string().trim().max(120).optional(),
        parentNodeId: z.string().trim().max(120).optional(),
        layer: z.number().int().min(0).max(100).optional(),
        layerKind: z.string().trim().max(120).optional(),
        summary: z.string().trim().max(2000).optional(),
        createdAt: z.string().max(80).optional(),
        updatedAt: z.string().max(80).optional(),
        llmLayerPurpose: z.string().trim().max(2000).optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough()

const nodeSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    type: z.literal("canvasNode").default("canvasNode"),
    position: positionSchema.default({ x: 0, y: 0 }),
    data: nodeDataSchema.default({ label: "" }),
    width: z.number().finite().positive().max(2000).optional(),
    height: z.number().finite().positive().max(2000).optional(),
    selected: z.boolean().optional(),
    dragging: z.boolean().optional(),
    resizing: z.boolean().optional(),
  })
  .passthrough()

const edgeDataSchema = z
  .object({
    semanticType: z.string().max(80).optional(),
    name: z.string().max(240).optional(),
    label: z.string().max(240).optional(),
    labels: z.array(z.string().max(240)).max(8).optional(),
    labelItems: z
      .array(
        z.object({
          id: z.string().max(120),
          text: z.string().max(240),
        })
      )
      .max(8)
      .optional(),
    description: z.string().max(4000).optional(),
    tags: z.array(z.string().max(80)).max(24).optional(),
    status: metadataStatusSchema,
    sourceRefs: z.array(z.string().max(240)).max(32).optional(),
    assumptions: z.array(z.string().max(500)).max(32).optional(),
    decisionRefs: z.array(z.string().max(240)).max(32).optional(),
    owner: z.string().max(240).nullable().optional(),
    createdAt: z.string().max(80).optional(),
    updatedAt: z.string().max(80).optional(),
  })
  .passthrough()

const edgeSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    source: z.string().trim().min(1).max(120),
    target: z.string().trim().min(1).max(120),
    sourceHandle: z.string().max(120).nullable().optional(),
    targetHandle: z.string().max(120).nullable().optional(),
    type: z.literal("canvasEdge").default("canvasEdge"),
    data: edgeDataSchema.default({}),
    selected: z.boolean().optional(),
  })
  .passthrough()

const canvasSnapshotSchema = z.object({
  nodes: z.array(nodeSchema).max(500).default([]),
  edges: z.array(edgeSchema).max(1000).default([]),
})

export function emptyCanvasSnapshot(): CanvasSnapshot {
  return { nodes: [], edges: [] }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
}

function normalizeStatus(value: unknown): CanvasMetadataStatus {
  return value === "approved" || value === "deprecated" ? value : "draft"
}

function normalizeShape(value: unknown): NodeShape {
  return typeof value === "string" && NODE_SHAPES.includes(value as NodeShape)
    ? (value as NodeShape)
    : "rectangle"
}

function sanitizeUnknownField(key: string, value: unknown): unknown {
  if (TRANSIENT_FIELD_KEYS.has(key)) return undefined
  if (shouldStripSecretField(key, value)) return undefined

  if (typeof value === "string") {
    return looksLikeRawSecretValue(value) ? "[redacted-secret]" : value
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeUnknownField(key, item))
      .filter((item) => item !== undefined)
  }

  if (isPlainRecord(value)) {
    return sanitizeDataRecord(value)
  }

  return value
}

function sanitizeDataRecord(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    const nextValue = sanitizeUnknownField(key, value)
    if (nextValue !== undefined) sanitized[key] = nextValue
  }

  return sanitized
}

function sanitizeTopLevelRest(
  data: Record<string, unknown>,
  omittedKeys: readonly string[]
): Record<string, unknown> {
  const sanitized = sanitizeDataRecord(data)
  for (const key of omittedKeys) {
    delete sanitized[key]
  }
  return sanitized
}

function normalizeNodeSemanticType(value: unknown) {
  return isSemanticNodeType(value) ? value : SEMANTIC_NODE_TYPES[0]
}

function normalizeEdgeSemanticType(value: unknown) {
  return isSemanticEdgeType(value) ? value : SEMANTIC_EDGE_TYPES[0]
}

function normalizeNodeData(data: z.infer<typeof nodeDataSchema>): CanvasNodeData {
  const sanitized = sanitizeDataRecord(data) as Partial<CanvasNodeData>
  const label = typeof sanitized.label === "string" ? sanitized.label.trim() : ""
  const name = typeof sanitized.name === "string" ? sanitized.name.trim() : label
  const shape = normalizeShape(sanitized.shape)

  return {
    ...sanitized,
    label,
    name,
    semanticType: normalizeNodeSemanticType(sanitized.semanticType),
    status: normalizeStatus(sanitized.status),
    tags: normalizeStringArray(sanitized.tags),
    sourceRefs: normalizeStringArray(sanitized.sourceRefs),
    assumptions: normalizeStringArray(sanitized.assumptions),
    decisionRefs: normalizeStringArray(sanitized.decisionRefs),
    owner: typeof sanitized.owner === "string" ? sanitized.owner.trim() || null : null,
    color: typeof sanitized.color === "string" ? sanitized.color : NODE_COLORS[0].fill,
    textColor:
      typeof sanitized.textColor === "string" ? sanitized.textColor : NODE_COLORS[0].text,
    shape,
  }
}

export function sanitizeCanvasSnapshot(value: unknown): CanvasSnapshot {
  const parsed = canvasSnapshotSchema.safeParse(value)
  if (!parsed.success) return emptyCanvasSnapshot()

  return {
    nodes: parsed.data.nodes.map((node) => {
      const data = normalizeNodeData(node.data)
      const shape = data.shape ?? "rectangle"
      const size = SHAPE_DEFAULTS[shape] ?? SHAPE_DEFAULTS.rectangle
      const rest = sanitizeTopLevelRest(node, [
        "selected",
        "dragging",
        "resizing",
        "data",
        "id",
        "type",
        "position",
        "width",
        "height",
      ])

      return {
        ...rest,
        id: node.id.trim(),
        type: "canvasNode",
        position: node.position,
        data,
        width: node.width ?? size.width,
        height: node.height ?? size.height,
      } as CanvasNode
    }),
    edges: parsed.data.edges.map((edge) => {
      const sanitizedData = sanitizeDataRecord(edge.data)
      const labelItems = normalizeEdgeLabelItems(sanitizedData)
      const mirroredLabels = mirrorEdgeLabelData(labelItems)
      const rest = sanitizeTopLevelRest(edge, [
        "selected",
        "data",
        "id",
        "source",
        "target",
        "sourceHandle",
        "targetHandle",
        "type",
      ])

      return {
        ...rest,
        id: edge.id.trim(),
        source: edge.source.trim(),
        target: edge.target.trim(),
        sourceHandle: edge.sourceHandle ?? null,
        targetHandle: edge.targetHandle ?? null,
        type: "canvasEdge",
        data: {
          ...sanitizedData,
          semanticType: normalizeEdgeSemanticType(sanitizedData.semanticType),
          name:
            typeof sanitizedData.name === "string"
              ? sanitizedData.name.trim()
              : mirroredLabels.label,
          status: normalizeStatus(sanitizedData.status),
          tags: normalizeStringArray(sanitizedData.tags),
          sourceRefs: normalizeStringArray(sanitizedData.sourceRefs),
          assumptions: normalizeStringArray(sanitizedData.assumptions),
          decisionRefs: normalizeStringArray(sanitizedData.decisionRefs),
          owner:
            typeof sanitizedData.owner === "string"
              ? sanitizedData.owner.trim() || null
              : null,
          ...mirroredLabels,
        },
        markerEnd: {
          type: "arrowclosed",
          color: "rgba(255,255,255,0.4)",
          width: 16,
          height: 16,
        },
      }
    }) as CanvasEdge[],
  }
}

export function serializeCanvasSnapshot(snapshot: CanvasSnapshot) {
  return sanitizeCanvasSnapshot(snapshot)
}
