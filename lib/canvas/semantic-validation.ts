import type { CanvasEdge, CanvasEdgeData, CanvasNode } from "@/types/canvas"
import {
  SEMANTIC_EDGE_DEFINITIONS,
  SEMANTIC_NODE_DEFINITIONS,
  normalizeEdgeRelationshipType,
  normalizeSemanticNodeType,
} from "@/types/canvas"
import type { CanvasSnapshot } from "@/lib/canvas/canvas-state"
import {
  isSecretReference,
  isSecretLikeKey,
  looksLikeRawSecretValue,
} from "@/lib/canvas/secret-guards"

export type SemanticValidationSeverity = "info" | "warning" | "error"
export type SemanticValidationTargetKind = "node" | "edge" | "canvas"

export interface SemanticValidationResult {
  id: string
  severity: SemanticValidationSeverity
  targetKind: SemanticValidationTargetKind
  targetId?: string
  message: string
  field?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasMeaningfulField(
  item: CanvasNode | CanvasEdge,
  field: string
): boolean {
  if (field === "id") return Boolean(item.id)
  if ("source" in item && field === "source") return Boolean(item.source)
  if ("target" in item && field === "target") return Boolean(item.target)

  const value = item.data?.[field]
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return value !== null && value !== undefined && value !== false
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0
}

function hasStringList(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => hasText(item))
}

function hasDescriptionOrResponsibilities(node: CanvasNode): boolean {
  return hasText(node.data.description) || hasStringList(node.data.responsibilities)
}

function findRawSecretFields(
  targetKind: "node" | "edge",
  targetId: string,
  value: unknown,
  path = "data"
): SemanticValidationResult[] {
  if (!isRecord(value)) return []

  const results: SemanticValidationResult[] = []
  for (const [key, childValue] of Object.entries(value)) {
    const fieldPath = `${path}.${key}`

    if (
      isSecretLikeKey(key) &&
      typeof childValue === "string" &&
      childValue.trim() &&
      !isSecretReference(childValue)
    ) {
      results.push({
        id: `${targetKind}-${targetId}-secret-${fieldPath}`,
        severity: "error",
        targetKind,
        targetId,
        field: fieldPath,
        message: "Raw secret-looking value must be stored as a secretRef.",
      })
      continue
    }

    if (typeof childValue === "string" && looksLikeRawSecretValue(childValue)) {
      results.push({
        id: `${targetKind}-${targetId}-secret-value-${fieldPath}`,
        severity: "error",
        targetKind,
        targetId,
        field: fieldPath,
        message: "Raw secret-looking value will not be exported.",
      })
      continue
    }

    if (Array.isArray(childValue)) {
      childValue.forEach((item, index) => {
        results.push(
          ...findRawSecretFields(targetKind, targetId, item, `${fieldPath}.${index}`)
        )
      })
      continue
    }

    results.push(
      ...findRawSecretFields(targetKind, targetId, childValue, fieldPath)
    )
  }

  return results
}

function validateNode(node: CanvasNode): SemanticValidationResult[] {
  const semanticType = normalizeSemanticNodeType(node.data.semanticType) ?? "generic-component"
  const definition = SEMANTIC_NODE_DEFINITIONS[semanticType]
  const results: SemanticValidationResult[] = []

  if (semanticType === "unclassified") {
    results.push({
      id: `node-${node.id}-unclassified`,
      severity: "warning",
      targetKind: "node",
      targetId: node.id,
      field: "semanticType",
      message: "Node is unclassified; add semantic meaning when you want stronger instructions.",
    })
  }

  for (const field of definition.requiredFields) {
    if (!hasMeaningfulField(node, field)) {
      results.push({
        id: `node-${node.id}-missing-${field}`,
        severity: "warning",
        targetKind: "node",
        targetId: node.id,
        field,
        message: `${definition.label} is missing required field: ${field}.`,
      })
    }
  }

  if (!hasDescriptionOrResponsibilities(node)) {
    results.push({
      id: `node-${node.id}-missing-responsibility`,
      severity: "warning",
      targetKind: "node",
      targetId: node.id,
      field: "responsibilities",
      message: `${definition.label} is missing responsibilities or a description.`,
    })
  }

  if (semanticType === "database" && !hasText(node.data.owner)) {
    results.push({
      id: `node-${node.id}-database-owner`,
      severity: "warning",
      targetKind: "node",
      targetId: node.id,
      field: "owner",
      message: "Database should declare an owner for stronger handoff prompts.",
    })
  }

  if (
    semanticType === "external-system" &&
    !hasText(node.data.securityNotes) &&
    !hasText(node.data.trustNotes) &&
    !hasText(node.data.authType)
  ) {
    results.push({
      id: `node-${node.id}-external-trust-notes`,
      severity: "warning",
      targetKind: "node",
      targetId: node.id,
      field: "securityNotes",
      message: "External System / Provider should note auth or trust assumptions.",
    })
  }

  if (
    semanticType === "worker" &&
    !hasText(node.data.retryPolicy) &&
    node.data.idempotencyRequired !== true &&
    !hasText(node.data.operationalNotes)
  ) {
    results.push({
      id: `node-${node.id}-worker-retry-idempotency`,
      severity: "warning",
      targetKind: "node",
      targetId: node.id,
      field: "retryPolicy",
      message: "Worker / Job should capture retry or idempotency notes.",
    })
  }

  if (
    (semanticType === "generic-component" || semanticType === "unclassified") &&
    !hasText(node.data.description)
  ) {
    results.push({
      id: `node-${node.id}-generic-description`,
      severity: "warning",
      targetKind: "node",
      targetId: node.id,
      field: "description",
      message: `${definition.label} should include a short description.`,
    })
  }

  if (!node.data.subcanvasRef) {
    results.push({
      id: `node-${node.id}-subcanvas-ref`,
      severity: "info",
      targetKind: "node",
      targetId: node.id,
      field: "subcanvasRef",
      message: `${definition.label} can have an inner design layer; layer is not created yet.`,
    })
  }

  results.push(...findRawSecretFields("node", node.id, node.data))
  return results
}

function validateEdge(
  edge: CanvasEdge,
  nodesById: Map<string, CanvasNode>
): SemanticValidationResult[] {
  const edgeData: CanvasEdgeData = edge.data ?? {}
  const relationshipType = normalizeEdgeRelationshipType(
    edgeData.relationshipType ?? edgeData.semanticType
  )
  const definition = relationshipType
    ? SEMANTIC_EDGE_DEFINITIONS[relationshipType]
    : SEMANTIC_EDGE_DEFINITIONS.unclassified
  const results: SemanticValidationResult[] = []

  if (!relationshipType) {
    results.push({
      id: `edge-${edge.id}-unclassified`,
      severity: "warning",
      targetKind: "edge",
      targetId: edge.id,
      field: "relationshipType",
      message: "Edge is untyped; choose a relationship type with technical meaning.",
    })
  }

  for (const field of definition.requiredFields) {
    if (!hasMeaningfulField(edge, field)) {
      results.push({
        id: `edge-${edge.id}-missing-${field}`,
        severity: "warning",
        targetKind: "edge",
        targetId: edge.id,
        field,
        message: `${definition.label} is missing required field: ${field}.`,
      })
    }
  }

  const target = nodesById.get(edge.target)
  const targetType = normalizeSemanticNodeType(target?.data.semanticType)

  if (
    (relationshipType === "reads" || relationshipType === "writes") &&
    targetType !== "database" &&
    targetType !== "entity" &&
    targetType !== "domain-model" &&
    targetType !== "cache-store" &&
    targetType !== "object-store"
  ) {
    results.push({
      id: `edge-${edge.id}-db-target`,
      severity: "warning",
      targetKind: "edge",
      targetId: edge.id,
      field: "target",
      message: `${definition.label} should target a database, entity, or domain model.`,
    })
  }

  if (relationshipType === "triggers" && targetType !== "worker") {
    results.push({
      id: `edge-${edge.id}-worker-target`,
      severity: "warning",
      targetKind: "edge",
      targetId: edge.id,
      field: "target",
      message: "Invokes Worker should target a worker node.",
    })
  }

  results.push(...findRawSecretFields("edge", edge.id, edgeData))
  return results
}

export function validateCanvasSemantics(
  snapshot: CanvasSnapshot
): SemanticValidationResult[] {
  const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]))
  const results: SemanticValidationResult[] = []

  for (const node of snapshot.nodes) {
    results.push(...validateNode(node))
  }

  for (const edge of snapshot.edges) {
    results.push(...validateEdge(edge, nodesById))
  }

  for (const node of snapshot.nodes) {
    const semanticType = normalizeSemanticNodeType(node.data.semanticType)
    if (semanticType !== "event-channel") continue

    const hasProducerOrConsumer = snapshot.edges.some((edge) => {
      const relationshipType = normalizeEdgeRelationshipType(
        edge.data?.relationshipType ?? edge.data?.semanticType
      )
      return (
        (relationshipType === "publishes" && edge.target === node.id) ||
        (relationshipType === "consumes" && edge.source === node.id)
      )
    })

    if (!hasProducerOrConsumer) {
      results.push({
        id: `node-${node.id}-event-channel-producer-consumer`,
        severity: "warning",
        targetKind: "node",
        targetId: node.id,
        field: "relationshipType",
        message: "Event Channel should show producer or consumer relationships.",
      })
    }
  }

  if (snapshot.nodes.length === 0 && snapshot.edges.length === 0) {
    results.push({
      id: "canvas-empty",
      severity: "info",
      targetKind: "canvas",
      message: "Canvas has no semantic architecture nodes yet.",
    })
  }

  return results
}
