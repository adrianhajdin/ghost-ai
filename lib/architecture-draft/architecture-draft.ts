import { z } from "zod"
import {
  NODE_COLORS,
  SHAPE_DEFAULTS,
  isSemanticEdgeType,
  isSemanticNodeType,
  normalizeEdgeRelationshipType,
  normalizeSemanticNodeType,
  type CanvasEdge,
  type CanvasNode,
  type NodeShape,
  type SemanticEdgeType,
  type SemanticNodeType,
} from "@/types/canvas"
import type { CanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { sanitizeCanvasSnapshot } from "@/lib/canvas/canvas-state"
import { baseNodeData, semanticDefaultsForType } from "@/lib/canvas/semantic-defaults"
import { createEdgeLabelItems, mirrorEdgeLabelData } from "@/lib/canvas/edge-labels"
import { ROOT_GRAPH_ID } from "@/lib/canvas/graph-ids"
import {
  isSecretReference,
  isSecretLikeKey,
  looksLikeRawSecretValue,
  shouldStripSecretField,
} from "@/lib/canvas/secret-guards"

export const ARCHITECTURE_DRAFT_VERSION = "1.0.0" as const
export const ARCHITECTURE_DRAFT_SCHEMA_URL =
  "https://arcforge.dev/schemas/architecture-draft.v1.json" as const

export const ARCHITECTURE_DRAFT_COMPLEXITIES = [
  "simple",
  "standard",
  "detailed",
] as const

export type ArchitectureDraftComplexity =
  (typeof ARCHITECTURE_DRAFT_COMPLEXITIES)[number]

export type ArchitectureDraftValidationSeverity = "info" | "warning" | "error"
export type ArchitectureDraftValidationTargetKind =
  | "proposal"
  | "graph"
  | "node"
  | "edge"

export interface ArchitectureDraftValidationResult {
  id: string
  severity: ArchitectureDraftValidationSeverity
  message: string
  targetKind: ArchitectureDraftValidationTargetKind
  targetId?: string
  field?: string
}

const safeIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9_-]*$/)
const graphIdSchema = safeIdSchema.regex(/^graph_[a-z0-9][a-z0-9_-]*$/)
const safeTextSchema = z.string().trim().min(1).max(240)
const optionalTextSchema = z.string().trim().max(4000).optional()
const metadataSchema = z.record(z.unknown()).default({})
const positionSchema = z
  .object({
    x: z.number().finite().min(-100000).max(100000),
    y: z.number().finite().min(-100000).max(100000),
  })
  .optional()

export const ArchitectureDraftComplexitySchema = z.enum(
  ARCHITECTURE_DRAFT_COMPLEXITIES
)

export const ArchitectureDraftNodeSchema = z
  .object({
    id: safeIdSchema.optional(),
    type: z.string().trim().min(1).max(120).optional(),
    semanticType: z.string().trim().min(1).max(120).optional(),
    label: safeTextSchema,
    name: z.string().trim().max(240).optional(),
    description: optionalTextSchema,
    metadata: metadataSchema,
    position: positionSchema,
  })
  .passthrough()

export const ArchitectureDraftEdgeSchema = z
  .object({
    id: safeIdSchema.optional(),
    source: safeIdSchema,
    target: safeIdSchema,
    type: z.string().trim().min(1).max(120).optional(),
    semanticType: z.string().trim().min(1).max(120).optional(),
    relationshipType: z.string().trim().min(1).max(120).optional(),
    label: z.string().trim().max(240).optional(),
    labels: z.array(z.string().trim().max(240)).max(8).default([]),
    metadata: metadataSchema,
  })
  .passthrough()

export const ArchitectureDraftGraphSchema = z
  .object({
    graphId: graphIdSchema.optional(),
    title: z.string().trim().min(1).max(240).optional(),
    layer: z.number().int().min(0).max(100).optional(),
    layerKind: z.string().trim().min(1).max(120).optional(),
    parentGraphId: graphIdSchema.nullable().optional(),
    parentNodeId: safeIdSchema.nullable().optional(),
    parentNodeTempId: safeIdSchema.nullable().optional(),
    summary: z.string().trim().max(2000).optional(),
    nodes: z.array(ArchitectureDraftNodeSchema).max(160).default([]),
    edges: z.array(ArchitectureDraftEdgeSchema).max(320).default([]),
  })
  .passthrough()

export const ArchitectureDraftProposalSchema = z
  .object({
    $schema: z.literal(ARCHITECTURE_DRAFT_SCHEMA_URL),
    draftVersion: z.literal(ARCHITECTURE_DRAFT_VERSION),
    status: z.literal("draft"),
    title: safeTextSchema,
    summary: z.string().trim().min(1).max(2000),
    targetGraphId: graphIdSchema,
    complexity: ArchitectureDraftComplexitySchema,
    nodes: z.array(ArchitectureDraftNodeSchema).max(160).default([]),
    edges: z.array(ArchitectureDraftEdgeSchema).max(320).default([]),
    graphs: z.array(ArchitectureDraftGraphSchema).max(80).default([]),
    clarificationQuestions: z
      .array(z.string().trim().min(1).max(500))
      .max(32)
      .default([]),
    assumptions: z.array(z.string().trim().min(1).max(500)).max(32).default([]),
    warnings: z.array(z.string().trim().min(1).max(500)).max(32).default([]),
    suggestedNextSteps: z
      .array(z.string().trim().min(1).max(500))
      .max(32)
      .default([]),
  })
  .passthrough()

export type ArchitectureDraftNode = z.infer<typeof ArchitectureDraftNodeSchema>
export type ArchitectureDraftEdge = z.infer<typeof ArchitectureDraftEdgeSchema>
export type ArchitectureDraftGraph = z.infer<typeof ArchitectureDraftGraphSchema>
export type ArchitectureDraftProposal = z.infer<
  typeof ArchitectureDraftProposalSchema
>

export interface ArchitectureDraftValidationContext {
  targetGraphId?: string
  existingCanvas?: {
    nodes: CanvasNode[]
    edges: CanvasEdge[]
  }
}

export interface ArchitectureDraftApplyResult {
  ok: true
  doc: CanvasDocV1
  validation: ArchitectureDraftValidationResult[]
  appliedNodes: number
  appliedEdges: number
  idMap: Record<string, string>
}

export interface ArchitectureDraftApplyBlockedResult {
  ok: false
  validation: ArchitectureDraftValidationResult[]
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function fieldPath(path: Array<string | number>) {
  return path.map(String).join(".") || undefined
}

function resultId(parts: Array<string | undefined>) {
  return parts
    .filter(Boolean)
    .join("-")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
}

function scanUnsafeFields(
  value: unknown,
  options: {
    targetKind: ArchitectureDraftValidationTargetKind
    targetId?: string
    path?: string
  }
): ArchitectureDraftValidationResult[] {
  if (!isRecord(value) && !Array.isArray(value)) return []

  const results: ArchitectureDraftValidationResult[] = []
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value)

  for (const [key, childValue] of entries) {
    const nextPath = options.path ? `${options.path}.${key}` : key

    if (TRANSIENT_FIELD_KEYS.has(key)) {
      results.push({
        id: resultId([
          options.targetKind,
          options.targetId,
          "transient",
          nextPath,
        ]),
        severity: "error",
        targetKind: options.targetKind,
        targetId: options.targetId,
        field: nextPath,
        message: "Transient UI state is not allowed in architecture drafts.",
      })
      continue
    }

    if (
      isSecretLikeKey(key) &&
      typeof childValue === "string" &&
      childValue.trim() &&
      !isSecretReference(childValue)
    ) {
      results.push({
        id: resultId([
          options.targetKind,
          options.targetId,
          "raw-secret-field",
          nextPath,
        ]),
        severity: "error",
        targetKind: options.targetKind,
        targetId: options.targetId,
        field: nextPath,
        message: "Raw secret-looking fields must use secretRef or secretCapabilityRef.",
      })
      continue
    }

    if (typeof childValue === "string" && looksLikeRawSecretValue(childValue)) {
      results.push({
        id: resultId([
          options.targetKind,
          options.targetId,
          "raw-secret-value",
          nextPath,
        ]),
        severity: "error",
        targetKind: options.targetKind,
        targetId: options.targetId,
        field: nextPath,
        message: "Raw secret-looking values are not allowed in architecture drafts.",
      })
      continue
    }

    if (isRecord(childValue) || Array.isArray(childValue)) {
      results.push(
        ...scanUnsafeFields(childValue, {
          ...options,
          path: nextPath,
        })
      )
    }
  }

  return results
}

function safeIdFromText(value: string, fallback: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/-{2,}/g, "-")
    .slice(0, 120)

  return /^[a-z0-9]/.test(slug) ? slug : fallback
}

function draftNodeId(node: ArchitectureDraftNode, index: number) {
  return node.id ?? safeIdFromText(node.label, `node-${index + 1}`)
}

function draftEdgeId(edge: ArchitectureDraftEdge, index: number) {
  return (
    edge.id ??
    safeIdFromText(
      `edge-${edge.source}-${edge.target}-${edge.semanticType ?? edge.type ?? index + 1}`,
      `edge-${index + 1}`
    )
  )
}

function graphIdForProposalGraph(
  graph: ArchitectureDraftGraph,
  index: number,
  targetGraphId: string
) {
  return graph.graphId ?? (index === 0 ? targetGraphId : `graph_layer_${index + 1}`)
}

export function getArchitectureDraftGraphs(
  proposal: ArchitectureDraftProposal
): ArchitectureDraftGraph[] {
  const graphs = proposal.graphs.map((graph, index) => ({
    ...graph,
    graphId: graphIdForProposalGraph(graph, index, proposal.targetGraphId),
  }))

  if (proposal.nodes.length > 0 || proposal.edges.length > 0) {
    const hasTargetGraph = graphs.some((graph) => graph.graphId === proposal.targetGraphId)
    if (!hasTargetGraph) {
      graphs.unshift({
        graphId: proposal.targetGraphId,
        title: proposal.title,
        layer: proposal.targetGraphId === ROOT_GRAPH_ID ? 0 : undefined,
        layerKind: proposal.targetGraphId === ROOT_GRAPH_ID ? "system-context" : "design-layer",
        parentGraphId: null,
        parentNodeId: null,
        parentNodeTempId: null,
        summary: proposal.summary,
        nodes: proposal.nodes,
        edges: proposal.edges,
      })
    }
  }

  return graphs
}

export function findArchitectureDraftGraph(
  proposal: ArchitectureDraftProposal,
  graphId: string
): ArchitectureDraftGraph | null {
  return getArchitectureDraftGraphs(proposal).find((graph) => graph.graphId === graphId) ?? null
}

export function parseArchitectureDraftProposal(
  value: unknown
): ArchitectureDraftProposal {
  return ArchitectureDraftProposalSchema.parse(value)
}

export function validateArchitectureDraftProposal(
  value: unknown,
  context: ArchitectureDraftValidationContext = {}
): ArchitectureDraftValidationResult[] {
  const parsed = ArchitectureDraftProposalSchema.safeParse(value)
  const results: ArchitectureDraftValidationResult[] = []

  if (!parsed.success) {
    parsed.error.issues.forEach((issue, index) => {
      results.push({
        id: `proposal-schema-${index}`,
        severity: "error",
        targetKind: "proposal",
        field: fieldPath(issue.path),
        message: issue.message,
      })
    })
    return results
  }

  const proposal = parsed.data
  const graphs = getArchitectureDraftGraphs(proposal)
  const hasProposalContent =
    proposal.nodes.length > 0 ||
    proposal.edges.length > 0 ||
    graphs.length > 0 ||
    proposal.clarificationQuestions.length > 0

  if (!hasProposalContent) {
    results.push({
      id: "proposal-empty",
      severity: "error",
      targetKind: "proposal",
      message: "Architecture draft proposal is empty.",
    })
  }

  results.push(
    ...scanUnsafeFields(proposal, {
      targetKind: "proposal",
    }).filter((result) => result.field !== undefined)
  )

  const activeGraphId = context.targetGraphId ?? proposal.targetGraphId
  const existingNodeIds = new Set(
    (context.existingCanvas?.nodes ?? []).map((node) => node.id)
  )

  for (const graph of graphs) {
    const graphId = graph.graphId ?? proposal.targetGraphId
    const nodeIds = new Set<string>()

    if (graphId === activeGraphId) {
      for (const nodeId of existingNodeIds) nodeIds.add(nodeId)
    }

    graph.nodes.forEach((node, index) => {
      const nodeId = draftNodeId(node, index)
      nodeIds.add(nodeId)
      results.push(
        ...scanUnsafeFields(node, {
          targetKind: "node",
          targetId: nodeId,
        })
      )
    })

    graph.edges.forEach((edge, index) => {
      const edgeId = draftEdgeId(edge, index)

      if (!nodeIds.has(edge.source)) {
        results.push({
          id: `edge-${edgeId}-missing-source`,
          severity: "error",
          targetKind: "edge",
          targetId: edgeId,
          field: "source",
          message: `Edge source does not exist in this graph: ${edge.source}.`,
        })
      }

      if (!nodeIds.has(edge.target)) {
        results.push({
          id: `edge-${edgeId}-missing-target`,
          severity: "error",
          targetKind: "edge",
          targetId: edgeId,
          field: "target",
          message: `Edge target does not exist in this graph: ${edge.target}.`,
        })
      }

      results.push(
        ...scanUnsafeFields(edge, {
          targetKind: "edge",
          targetId: edgeId,
        })
      )
    })
  }

  return results
}

export function architectureDraftHasErrors(
  validation: ArchitectureDraftValidationResult[]
) {
  return validation.some((result) => result.severity === "error")
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

  if (isRecord(value)) return sanitizeMetadataRecord(value)

  return value
}

function sanitizeMetadataRecord(value: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, childValue] of Object.entries(value)) {
    const sanitized = sanitizeUnknownField(key, childValue)
    if (sanitized !== undefined) output[key] = sanitized
  }
  return output
}

function sanitizeNode(node: ArchitectureDraftNode) {
  return {
    ...sanitizeMetadataRecord(node),
    metadata: sanitizeMetadataRecord(node.metadata),
  }
}

function sanitizeEdge(edge: ArchitectureDraftEdge) {
  return {
    ...sanitizeMetadataRecord(edge),
    metadata: sanitizeMetadataRecord(edge.metadata),
  }
}

export function sanitizeArchitectureDraftProposal(
  value: ArchitectureDraftProposal
): ArchitectureDraftProposal {
  return ArchitectureDraftProposalSchema.parse({
    ...sanitizeMetadataRecord(value),
    nodes: value.nodes.map(sanitizeNode),
    edges: value.edges.map(sanitizeEdge),
    graphs: value.graphs.map((graph) => ({
      ...sanitizeMetadataRecord(graph),
      nodes: graph.nodes.map(sanitizeNode),
      edges: graph.edges.map(sanitizeEdge),
    })),
  })
}

function knownNodeSemanticType(value: unknown): SemanticNodeType {
  if (value === "unclassified") return "unclassified"
  return normalizeSemanticNodeType(value) ?? "generic-component"
}

function knownEdgeSemanticType(value: unknown): SemanticEdgeType {
  if (isSemanticEdgeType(value)) return value
  return normalizeEdgeRelationshipType(value) ?? "unclassified"
}

function draftNodeTypeText(draftNode: ArchitectureDraftNode) {
  return draftNode.semanticType?.trim() || draftNode.type?.trim() || "unclassified"
}

function draftEdgeTypeText(draftEdge: ArchitectureDraftEdge) {
  return (
    draftEdge.relationshipType?.trim() ||
    draftEdge.semanticType?.trim() ||
    draftEdge.type?.trim() ||
    "unclassified"
  )
}

function nodeShapeAndColor(semanticType: SemanticNodeType): {
  shape: NodeShape
  colorIndex: number
} {
  switch (semanticType) {
    case "actor":
      return { shape: "circle", colorIndex: 2 }
    case "client-surface":
    case "frontend":
      return { shape: "rectangle", colorIndex: 5 }
    case "service":
    case "api":
      return { shape: "pill", colorIndex: 1 }
    case "database":
    case "cache-store":
    case "object-store":
    case "cache":
    case "domain-model":
      return { shape: "cylinder", colorIndex: 7 }
    case "event-channel":
    case "queue":
    case "worker":
      return { shape: "hexagon", colorIndex: 6 }
    case "external-system":
      return { shape: "hexagon", colorIndex: 3 }
    case "identity-auth":
    case "auth-module":
    case "policy":
      return { shape: "pill", colorIndex: 2 }
    default:
      return { shape: "rectangle", colorIndex: 0 }
  }
}

function defaultNodeMetadata(semanticType: SemanticNodeType): Record<string, unknown> {
  const defaults = semanticDefaultsForType(semanticType)
  switch (semanticType) {
    case "client-surface":
    case "frontend":
      return {
        semanticType: "client-surface",
        clientKind: "web-app",
        framework: "nextjs",
        routes: [],
        authFlow: "cookie-session",
        ...defaults,
      }
    case "api":
      return {
        semanticType,
        apiStyle: "rest",
        basePath: "/api",
        version: "v1",
        authRequired: true,
        ...defaults,
      }
    case "cache-store":
    case "cache":
      return {
        semanticType: "cache-store",
        cacheKind: "redis",
        ttlPolicy: "bounded",
        evictionPolicy: "lru",
        ...defaults,
      }
    case "event-channel":
    case "queue":
      return {
        semanticType: "event-channel",
        messagingKind: "queue",
        deliverySemantics: "at-least-once",
        deadLetterPolicy: "required",
        ...defaults,
      }
    case "identity-auth":
    case "auth-module":
      return {
        semanticType: "identity-auth",
        authStrategy: "internal-cookie-session",
        sessionMode: "httpOnly-cookie",
        emailVerification: true,
        ...defaults,
      }
    case "external-system":
      return {
        semanticType,
        vendorType: "external-service",
        authType: "secretRef",
        rateLimit: "provider-defined",
        ...defaults,
      }
    case "domain-model":
      return {
        semanticType,
        aggregateKind: "domain-aggregate",
        entities: [],
        invariants: [],
        ...defaults,
      }
    default:
      return { semanticType, ...defaults }
  }
}

function gridPosition(index: number, existingNodes: CanvasNode[]) {
  const columns = 4
  const x = 80 + (index % columns) * 240
  const maxY =
    existingNodes.length === 0
      ? 0
      : Math.max(...existingNodes.map((node) => node.position.y + (node.height ?? 80)))
  const y = 80 + Math.floor(index / columns) * 170 + (existingNodes.length ? maxY + 120 : 0)
  return { x, y }
}

function resolveCollision(id: string, usedIds: Set<string>) {
  let nextId = id
  let index = 2
  while (usedIds.has(nextId)) {
    nextId = `${id}-${index}`
    index += 1
  }
  usedIds.add(nextId)
  return nextId
}

function toCanvasNode(
  draftNode: ArchitectureDraftNode,
  id: string,
  index: number,
  existingNodes: CanvasNode[]
): CanvasNode {
  const architectureType = draftNodeTypeText(draftNode)
  const semanticType = knownNodeSemanticType(architectureType)
  const { shape, colorIndex } = nodeShapeAndColor(semanticType)
  const color = NODE_COLORS[colorIndex]
  const size = SHAPE_DEFAULTS[shape] ?? SHAPE_DEFAULTS.rectangle
  const metadata = sanitizeMetadataRecord(draftNode.metadata)
  const name =
    draftNode.name?.trim() ||
    (typeof metadata.name === "string" ? metadata.name.trim() : "") ||
    draftNode.label
  const position = draftNode.position ?? gridPosition(index, existingNodes)
  const customTypeMetadata = isSemanticNodeType(architectureType)
    ? { architectureType: draftNode.type ?? architectureType }
    : {
        llmSemanticType: architectureType,
        architectureType: draftNode.type ?? architectureType,
        originalSemanticType: draftNode.semanticType ?? architectureType,
      }

  return {
    id,
    type: "canvasNode",
    position,
    width: size.width,
    height: size.height,
    data: {
      ...baseNodeData(draftNode.label),
      ...defaultNodeMetadata(semanticType),
      ...metadata,
      ...customTypeMetadata,
      semanticType,
      label: draftNode.label,
      name,
      description:
        draftNode.description ??
        (typeof metadata.description === "string" ? metadata.description : ""),
      status: "draft",
      color: color.fill,
      textColor: color.text,
      shape,
    },
  }
}

function toCanvasEdge(
  draftEdge: ArchitectureDraftEdge,
  id: string,
  source: string,
  target: string
): CanvasEdge {
  const architectureType = draftEdgeTypeText(draftEdge)
  const semanticType = knownEdgeSemanticType(architectureType)
  const relationshipType = normalizeEdgeRelationshipType(
    draftEdge.relationshipType ?? architectureType
  )
  const metadata = sanitizeMetadataRecord(draftEdge.metadata)
  const labels = draftEdge.labels.length > 0 ? draftEdge.labels : draftEdge.label ? [draftEdge.label] : []
  const labelItems = createEdgeLabelItems(labels, [], `${id}-label`)
  const mirroredLabels = mirrorEdgeLabelData(labelItems)
  const customTypeMetadata = isSemanticEdgeType(architectureType)
    ? { architectureType: draftEdge.type ?? architectureType }
    : {
        llmSemanticType: architectureType,
        architectureType: draftEdge.type ?? architectureType,
        originalSemanticType: draftEdge.semanticType ?? architectureType,
      }

  return {
    id,
    type: "canvasEdge",
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
    data: {
      ...metadata,
      ...customTypeMetadata,
      semanticType,
      relationshipType: relationshipType ?? undefined,
      name:
        typeof metadata.name === "string" && metadata.name.trim()
          ? metadata.name.trim()
          : mirroredLabels.label,
      status: "draft",
      tags: Array.isArray(metadata.tags) ? metadata.tags : [],
      sourceRefs: Array.isArray(metadata.sourceRefs) ? metadata.sourceRefs : [],
      assumptions: Array.isArray(metadata.assumptions) ? metadata.assumptions : [],
      decisionRefs: Array.isArray(metadata.decisionRefs) ? metadata.decisionRefs : [],
      owner: typeof metadata.owner === "string" ? metadata.owner : null,
      ...mirroredLabels,
    },
    markerEnd: {
      type: "arrowclosed",
      color: "rgba(255,255,255,0.4)",
      width: 16,
      height: 16,
    },
  }
}

export function applyArchitectureDraftGraphToCanvasDoc(
  doc: CanvasDocV1,
  value: unknown,
  graphInput?: ArchitectureDraftGraph
): ArchitectureDraftApplyResult | ArchitectureDraftApplyBlockedResult {
  const validation = validateArchitectureDraftProposal(value, {
    targetGraphId: doc.graphId,
    existingCanvas: { nodes: doc.nodes, edges: doc.edges },
  })

  if (architectureDraftHasErrors(validation)) {
    return { ok: false, validation }
  }

  const proposal = sanitizeArchitectureDraftProposal(
    parseArchitectureDraftProposal(value)
  )
  const graph =
    graphInput ??
    findArchitectureDraftGraph(proposal, doc.graphId) ?? {
      graphId: doc.graphId,
      title: proposal.title,
      summary: proposal.summary,
      nodes: proposal.nodes,
      edges: proposal.edges,
    }
  const usedNodeIds = new Set(doc.nodes.map((node) => node.id))
  const usedEdgeIds = new Set(doc.edges.map((edge) => edge.id))
  const idMap: Record<string, string> = {}
  const newNodes: CanvasNode[] = []
  const newEdges: CanvasEdge[] = []

  graph.nodes.forEach((draftNode, index) => {
    const originalId = draftNodeId(draftNode, index)
    const nextId = resolveCollision(originalId, usedNodeIds)
    idMap[originalId] = nextId
    newNodes.push(toCanvasNode(draftNode, nextId, index, doc.nodes))
  })

  graph.edges.forEach((draftEdge, index) => {
    const originalId = draftEdgeId(draftEdge, index)
    const nextId = resolveCollision(originalId, usedEdgeIds)
    idMap[originalId] = nextId
    const source = idMap[draftEdge.source] ?? draftEdge.source
    const target = idMap[draftEdge.target] ?? draftEdge.target
    newEdges.push(toCanvasEdge(draftEdge, nextId, source, target))
  })

  const sanitizedCanvas = sanitizeCanvasSnapshot({
    nodes: [...doc.nodes, ...newNodes],
    edges: [...doc.edges, ...newEdges],
  })

  return {
    ok: true,
    doc: {
      ...doc,
      title: graph.title ?? doc.title,
      layer: graph.layer ?? doc.layer,
      layerKind: graph.layerKind ?? doc.layerKind,
      summary: graph.summary ?? doc.summary,
      nodes: sanitizedCanvas.nodes,
      edges: sanitizedCanvas.edges,
    },
    validation,
    appliedNodes: newNodes.length,
    appliedEdges: newEdges.length,
    idMap,
  }
}

export function applyArchitectureDraftProposalToCanvasDoc(
  doc: CanvasDocV1,
  value: unknown
): ArchitectureDraftApplyResult | ArchitectureDraftApplyBlockedResult {
  return applyArchitectureDraftGraphToCanvasDoc(doc, value)
}

export function summarizeCanvasForArchitectureDraft(doc: CanvasDocV1 | null) {
  const nodes = doc?.nodes ?? []
  const edges = doc?.edges ?? []
  const nodeTypes = nodes.reduce<Record<string, number>>((counts, node) => {
    const type =
      typeof node.data.architectureType === "string"
        ? node.data.architectureType
        : node.data.semanticType ?? "unclassified"
    counts[type] = (counts[type] ?? 0) + 1
    return counts
  }, {})
  const edgeTypes = edges.reduce<Record<string, number>>((counts, edge) => {
    const data = edge.data ?? {}
    const type =
      typeof data.architectureType === "string"
        ? data.architectureType
        : data.semanticType ?? "unclassified"
    counts[type] = (counts[type] ?? 0) + 1
    return counts
  }, {})

  return {
    graphId: doc?.graphId ?? ROOT_GRAPH_ID,
    title: doc?.title ?? "System",
    parentGraphId: doc?.parentGraphId ?? null,
    parentNodeId: doc?.parentNodeId ?? null,
    layer: doc?.layer ?? null,
    layerKind: doc?.layerKind ?? null,
    summary: doc?.summary ?? null,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeTypes,
    edgeTypes,
    nodes: nodes.slice(0, 24).map((node) => ({
      id: node.id,
      label: node.data.label,
      name: node.data.name,
      semanticType: node.data.semanticType,
      architectureType: node.data.architectureType,
      subcanvasGraphId: node.data.subcanvasRef?.graphId,
    })),
    edges: edges.slice(0, 32).map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      semanticType: edge.data?.semanticType,
      architectureType: edge.data?.architectureType,
      label: edge.data?.label,
    })),
  }
}

export function createArchitectureDraftSummary(
  proposal: ArchitectureDraftProposal,
  validation: ArchitectureDraftValidationResult[]
) {
  const graphs = getArchitectureDraftGraphs(proposal)
  const nodeCount = graphs.reduce((count, graph) => count + graph.nodes.length, 0)
  const edgeCount = graphs.reduce((count, graph) => count + graph.edges.length, 0)
  const childLayerCount = graphs.filter((graph) => graph.parentGraphId || graph.parentNodeTempId || graph.parentNodeId).length

  return {
    title: proposal.title,
    nodeCount,
    edgeCount,
    graphCount: graphs.length,
    childLayerCount,
    clarificationQuestionCount: proposal.clarificationQuestions.length,
    errors: validation.filter((result) => result.severity === "error").length,
    warnings: validation.filter((result) => result.severity === "warning").length,
    info: validation.filter((result) => result.severity === "info").length,
  }
}
