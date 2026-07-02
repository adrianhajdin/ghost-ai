import { z } from "zod"
import {
  NODE_COLORS,
  SEMANTIC_EDGE_DEFINITIONS,
  SEMANTIC_EDGE_TYPES,
  SEMANTIC_NODE_DEFINITIONS,
  SEMANTIC_NODE_TYPES,
  SHAPE_DEFAULTS,
  type CanvasEdge,
  type CanvasNode,
  type NodeShape,
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
export type ArchitectureDraftValidationTargetKind = "proposal" | "node" | "edge"

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
    id: safeIdSchema,
    semanticType: z.enum(SEMANTIC_NODE_TYPES),
    label: safeTextSchema,
    name: z.string().trim().max(240).optional(),
    description: optionalTextSchema,
    metadata: metadataSchema,
    position: positionSchema,
  })
  .passthrough()

export const ArchitectureDraftEdgeSchema = z
  .object({
    id: safeIdSchema,
    source: safeIdSchema,
    target: safeIdSchema,
    semanticType: z.enum(SEMANTIC_EDGE_TYPES),
    label: z.string().trim().max(240).optional(),
    labels: z.array(z.string().trim().max(240)).max(8).default([]),
    metadata: metadataSchema,
  })
  .passthrough()

export const ArchitectureDraftProposalSchema = z
  .object({
    $schema: z.literal(ARCHITECTURE_DRAFT_SCHEMA_URL),
    draftVersion: z.literal(ARCHITECTURE_DRAFT_VERSION),
    status: z.literal("draft"),
    title: safeTextSchema,
    summary: z.string().trim().min(1).max(2000),
    targetGraphId: safeIdSchema,
    complexity: ArchitectureDraftComplexitySchema,
    nodes: z.array(ArchitectureDraftNodeSchema).min(1).max(80),
    edges: z.array(ArchitectureDraftEdgeSchema).max(160),
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

const ROOT_NODE_TYPES = new Set<SemanticNodeType>([
  "service",
  "api",
  "frontend",
  "database",
  "cache",
  "queue",
  "worker",
  "external-system",
  "auth-module",
  "domain-model",
  "policy",
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

function addValidation(
  results: ArchitectureDraftValidationResult[],
  result: ArchitectureDraftValidationResult
) {
  results.push(result)
}

function hasMeaningfulValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return value !== null && value !== undefined && value !== false
}

function proposalNodeField(node: ArchitectureDraftNode, field: string): unknown {
  if (field === "id") return node.id
  if (field === "name") return node.name || node.label || node.metadata.name
  return node.metadata[field]
}

function proposalEdgeField(edge: ArchitectureDraftEdge, field: string): unknown {
  if (field === "id") return edge.id
  if (field === "source") return edge.source
  if (field === "target") return edge.target
  if (field === "label") return edge.label || edge.labels[0]
  return edge.metadata[field]
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

function semanticNodeTypeForId(
  nodeTypesById: Map<string, SemanticNodeType>,
  id: string
) {
  return nodeTypesById.get(id)
}

function validateNode(
  node: ArchitectureDraftNode,
  results: ArchitectureDraftValidationResult[]
) {
  if (node.semanticType === "unclassified") {
    addValidation(results, {
      id: `node-${node.id}-unclassified`,
      severity: "error",
      targetKind: "node",
      targetId: node.id,
      field: "semanticType",
      message: "Architecture draft nodes must have a concrete semantic type.",
    })
  }

  if (!ROOT_NODE_TYPES.has(node.semanticType)) {
    addValidation(results, {
      id: `node-${node.id}-unsupported-root-type`,
      severity: "error",
      targetKind: "node",
      targetId: node.id,
      field: "semanticType",
      message: `${SEMANTIC_NODE_DEFINITIONS[node.semanticType].label} is not supported in root architecture drafts yet.`,
    })
  }

  for (const field of SEMANTIC_NODE_DEFINITIONS[node.semanticType].requiredFields) {
    if (!hasMeaningfulValue(proposalNodeField(node, field))) {
      addValidation(results, {
        id: `node-${node.id}-missing-${field}`,
        severity: "error",
        targetKind: "node",
        targetId: node.id,
        field,
        message: `${SEMANTIC_NODE_DEFINITIONS[node.semanticType].label} is missing required field: ${field}.`,
      })
    }
  }

  results.push(
    ...scanUnsafeFields(node, {
      targetKind: "node",
      targetId: node.id,
    })
  )
}

function validateEdge(
  edge: ArchitectureDraftEdge,
  nodeTypesById: Map<string, SemanticNodeType>,
  nodeIds: Set<string>,
  results: ArchitectureDraftValidationResult[]
) {
  if (edge.semanticType === "unclassified") {
    addValidation(results, {
      id: `edge-${edge.id}-unclassified`,
      severity: "error",
      targetKind: "edge",
      targetId: edge.id,
      field: "semanticType",
      message: "Architecture draft edges must have a concrete semantic type.",
    })
  }

  if (!nodeIds.has(edge.source)) {
    addValidation(results, {
      id: `edge-${edge.id}-missing-source`,
      severity: "error",
      targetKind: "edge",
      targetId: edge.id,
      field: "source",
      message: `Edge source does not exist in this graph: ${edge.source}.`,
    })
  }

  if (!nodeIds.has(edge.target)) {
    addValidation(results, {
      id: `edge-${edge.id}-missing-target`,
      severity: "error",
      targetKind: "edge",
      targetId: edge.id,
      field: "target",
      message: `Edge target does not exist in this graph: ${edge.target}.`,
    })
  }

  for (const field of SEMANTIC_EDGE_DEFINITIONS[edge.semanticType].requiredFields) {
    if (!hasMeaningfulValue(proposalEdgeField(edge, field))) {
      addValidation(results, {
        id: `edge-${edge.id}-missing-${field}`,
        severity: "error",
        targetKind: "edge",
        targetId: edge.id,
        field,
        message: `${SEMANTIC_EDGE_DEFINITIONS[edge.semanticType].label} is missing required field: ${field}.`,
      })
    }
  }

  const targetType = semanticNodeTypeForId(nodeTypesById, edge.target)
  if (
    (edge.semanticType === "db-read" || edge.semanticType === "db-write") &&
    targetType !== "database" &&
    targetType !== "entity" &&
    targetType !== "domain-model"
  ) {
    addValidation(results, {
      id: `edge-${edge.id}-db-target`,
      severity: "error",
      targetKind: "edge",
      targetId: edge.id,
      field: "target",
      message: `${SEMANTIC_EDGE_DEFINITIONS[edge.semanticType].label} must target a database, entity, or domain model.`,
    })
  }

  if (edge.semanticType === "invokes-worker" && targetType !== "worker") {
    addValidation(results, {
      id: `edge-${edge.id}-worker-target`,
      severity: "error",
      targetKind: "edge",
      targetId: edge.id,
      field: "target",
      message: "Invokes Worker must target a worker node.",
    })
  }

  if (
    edge.semanticType === "auth-check" &&
    targetType !== "auth-module" &&
    targetType !== "policy"
  ) {
    addValidation(results, {
      id: `edge-${edge.id}-auth-target`,
      severity: "error",
      targetKind: "edge",
      targetId: edge.id,
      field: "target",
      message: "Auth Check must target an auth module or policy node.",
    })
  }

  results.push(
    ...scanUnsafeFields(edge, {
      targetKind: "edge",
      targetId: edge.id,
    })
  )
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
  const targetGraphId = context.targetGraphId ?? ROOT_GRAPH_ID
  if (proposal.targetGraphId !== targetGraphId) {
    results.push({
      id: "proposal-target-graph-id",
      severity: "error",
      targetKind: "proposal",
      field: "targetGraphId",
      message: `Architecture draft targets ${proposal.targetGraphId}, but the active graph is ${targetGraphId}.`,
    })
  }

  if (proposal.targetGraphId !== ROOT_GRAPH_ID) {
    results.push({
      id: "proposal-root-only",
      severity: "error",
      targetKind: "proposal",
      field: "targetGraphId",
      message: "Architecture Draft v1 only applies to the root graph.",
    })
  }

  results.push(
    ...scanUnsafeFields(proposal, {
      targetKind: "proposal",
    }).filter((result) => result.field !== undefined)
  )

  const existingNodeTypes = new Map<string, SemanticNodeType>()
  const nodeTypesById = new Map<string, SemanticNodeType>()
  const nodeIds = new Set<string>()
  const proposalNodeIds = new Set<string>()
  const proposalEdgeIds = new Set<string>()

  for (const node of context.existingCanvas?.nodes ?? []) {
    nodeIds.add(node.id)
    if (
      typeof node.data.semanticType === "string" &&
      (SEMANTIC_NODE_TYPES as readonly string[]).includes(node.data.semanticType)
    ) {
      existingNodeTypes.set(node.id, node.data.semanticType as SemanticNodeType)
      nodeTypesById.set(node.id, node.data.semanticType as SemanticNodeType)
    }
  }

  for (const node of proposal.nodes) {
    if (proposalNodeIds.has(node.id)) {
      results.push({
        id: `node-${node.id}-duplicate`,
        severity: "error",
        targetKind: "node",
        targetId: node.id,
        field: "id",
        message: `Duplicate proposal node id: ${node.id}.`,
      })
    }
    proposalNodeIds.add(node.id)
    nodeIds.add(node.id)
    nodeTypesById.set(node.id, node.semanticType)
    validateNode(node, results)
  }

  for (const [id, semanticType] of existingNodeTypes) {
    if (!nodeTypesById.has(id)) nodeTypesById.set(id, semanticType)
  }

  for (const edge of proposal.edges) {
    if (proposalEdgeIds.has(edge.id)) {
      results.push({
        id: `edge-${edge.id}-duplicate`,
        severity: "error",
        targetKind: "edge",
        targetId: edge.id,
        field: "id",
        message: `Duplicate proposal edge id: ${edge.id}.`,
      })
    }
    proposalEdgeIds.add(edge.id)
    validateEdge(edge, nodeTypesById, nodeIds, results)
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

export function sanitizeArchitectureDraftProposal(
  value: ArchitectureDraftProposal
): ArchitectureDraftProposal {
  return ArchitectureDraftProposalSchema.parse({
    ...sanitizeMetadataRecord(value),
    nodes: value.nodes.map((node) => ({
      ...sanitizeMetadataRecord(node),
      metadata: sanitizeMetadataRecord(node.metadata),
    })),
    edges: value.edges.map((edge) => ({
      ...sanitizeMetadataRecord(edge),
      metadata: sanitizeMetadataRecord(edge.metadata),
    })),
  })
}

function nodeShapeAndColor(semanticType: SemanticNodeType): {
  shape: NodeShape
  colorIndex: number
} {
  switch (semanticType) {
    case "frontend":
      return { shape: "circle", colorIndex: 5 }
    case "service":
    case "api":
      return { shape: "pill", colorIndex: 1 }
    case "database":
    case "cache":
    case "domain-model":
      return { shape: "cylinder", colorIndex: 7 }
    case "queue":
    case "worker":
      return { shape: "hexagon", colorIndex: 6 }
    case "external-system":
      return { shape: "hexagon", colorIndex: 3 }
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
    case "frontend":
      return {
        semanticType,
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
    case "cache":
      return {
        semanticType,
        cacheKind: "redis",
        ttlPolicy: "bounded",
        evictionPolicy: "lru",
        ...defaults,
      }
    case "queue":
      return {
        semanticType,
        messagingKind: "queue",
        deliverySemantics: "at-least-once",
        deadLetterPolicy: "required",
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
  const { shape, colorIndex } = nodeShapeAndColor(draftNode.semanticType)
  const color = NODE_COLORS[colorIndex]
  const size = SHAPE_DEFAULTS[shape] ?? SHAPE_DEFAULTS.rectangle
  const metadata = sanitizeMetadataRecord(draftNode.metadata)
  const name =
    draftNode.name?.trim() ||
    (typeof metadata.name === "string" ? metadata.name.trim() : "") ||
    draftNode.label
  const position = draftNode.position ?? gridPosition(index, existingNodes)

  return {
    id,
    type: "canvasNode",
    position,
    width: size.width,
    height: size.height,
    data: {
      ...baseNodeData(draftNode.label),
      ...defaultNodeMetadata(draftNode.semanticType),
      ...metadata,
      semanticType: draftNode.semanticType,
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
  const metadata = sanitizeMetadataRecord(draftEdge.metadata)
  const labels = draftEdge.labels.length > 0 ? draftEdge.labels : draftEdge.label ? [draftEdge.label] : []
  const labelItems = createEdgeLabelItems(labels, [], `${id}-label`)
  const mirroredLabels = mirrorEdgeLabelData(labelItems)

  return {
    id,
    type: "canvasEdge",
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
    data: {
      ...metadata,
      semanticType: draftEdge.semanticType,
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

export function applyArchitectureDraftProposalToCanvasDoc(
  doc: CanvasDocV1,
  value: unknown
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
  const usedNodeIds = new Set(doc.nodes.map((node) => node.id))
  const usedEdgeIds = new Set(doc.edges.map((edge) => edge.id))
  const idMap: Record<string, string> = {}
  const newNodes: CanvasNode[] = []
  const newEdges: CanvasEdge[] = []

  proposal.nodes.forEach((draftNode, index) => {
    const nextId = resolveCollision(draftNode.id, usedNodeIds)
    idMap[draftNode.id] = nextId
    newNodes.push(toCanvasNode(draftNode, nextId, index, doc.nodes))
  })

  proposal.edges.forEach((draftEdge) => {
    const nextId = resolveCollision(draftEdge.id, usedEdgeIds)
    idMap[draftEdge.id] = nextId
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
      nodes: sanitizedCanvas.nodes,
      edges: sanitizedCanvas.edges,
    },
    validation,
    appliedNodes: newNodes.length,
    appliedEdges: newEdges.length,
    idMap,
  }
}

export function summarizeCanvasForArchitectureDraft(doc: CanvasDocV1 | null) {
  const nodes = doc?.nodes ?? []
  const edges = doc?.edges ?? []
  const nodeTypes = nodes.reduce<Record<string, number>>((counts, node) => {
    const type = node.data.semanticType ?? "unclassified"
    counts[type] = (counts[type] ?? 0) + 1
    return counts
  }, {})
  const edgeTypes = edges.reduce<Record<string, number>>((counts, edge) => {
    const type = edge.data?.semanticType ?? "unclassified"
    counts[type] = (counts[type] ?? 0) + 1
    return counts
  }, {})

  return {
    graphId: doc?.graphId ?? ROOT_GRAPH_ID,
    title: doc?.title ?? "System",
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeTypes,
    edgeTypes,
    nodes: nodes.slice(0, 24).map((node) => ({
      id: node.id,
      label: node.data.label,
      name: node.data.name,
      semanticType: node.data.semanticType,
    })),
    edges: edges.slice(0, 32).map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      semanticType: edge.data?.semanticType,
      label: edge.data?.label,
    })),
  }
}

export function createArchitectureDraftSummary(
  proposal: ArchitectureDraftProposal,
  validation: ArchitectureDraftValidationResult[]
) {
  return {
    title: proposal.title,
    nodeCount: proposal.nodes.length,
    edgeCount: proposal.edges.length,
    errors: validation.filter((result) => result.severity === "error").length,
    warnings: validation.filter((result) => result.severity === "warning").length,
    info: validation.filter((result) => result.severity === "info").length,
  }
}
