import type { CanvasEdge, CanvasEdgeData, CanvasNode } from "@/types/canvas"
import {
  SEMANTIC_EDGE_DEFINITIONS,
  SEMANTIC_NODE_DEFINITIONS,
  isSemanticEdgeType,
  isSemanticNodeType,
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
  const semanticType = isSemanticNodeType(node.data.semanticType)
    ? node.data.semanticType
    : "unclassified"
  const definition = SEMANTIC_NODE_DEFINITIONS[semanticType]
  const results: SemanticValidationResult[] = []

  if (semanticType === "unclassified") {
    results.push({
      id: `node-${node.id}-unclassified`,
      severity: "warning",
      targetKind: "node",
      targetId: node.id,
      field: "semanticType",
      message: "Node is unclassified; choose a semantic type before generating instructions.",
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
  const semanticType = isSemanticEdgeType(edgeData.semanticType)
    ? edgeData.semanticType
    : "unclassified"
  const definition = SEMANTIC_EDGE_DEFINITIONS[semanticType]
  const results: SemanticValidationResult[] = []

  if (semanticType === "unclassified") {
    results.push({
      id: `edge-${edge.id}-unclassified`,
      severity: "warning",
      targetKind: "edge",
      targetId: edge.id,
      field: "semanticType",
      message: "Edge is unclassified; choose a semantic type with technical meaning.",
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
  const targetType = target?.data.semanticType

  if (
    (semanticType === "db-read" || semanticType === "db-write") &&
    targetType !== "database" &&
    targetType !== "entity" &&
    targetType !== "domain-model"
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

  if (semanticType === "invokes-worker" && targetType !== "worker") {
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
