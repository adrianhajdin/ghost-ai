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
import { edgeLabelTexts } from "@/lib/canvas/edge-labels"

export type SemanticValidationSeverity = "info" | "warning" | "error"
export type SemanticQualitySeverity = "info" | "warning" | "high"
export type SemanticValidationTargetKind = "node" | "edge" | "canvas"
export type SemanticValidationCategory =
  | "relationship-clarity"
  | "topology-quality"
  | "state-ownership"
  | "async-integrity"
  | "security-integration"
  | "trust-boundaries"
  | "cross-layer-references"
  | "runtime-operations"
  | "operability"
  | "ai-governance"
  | "safety"

export interface SemanticValidationResult {
  id: string
  severity: SemanticValidationSeverity
  qualitySeverity?: SemanticQualitySeverity
  category: SemanticValidationCategory
  advisory: boolean
  blocking: boolean
  targetKind: SemanticValidationTargetKind
  targetId?: string
  message: string
  field?: string
}

export interface SemanticScanState {
  dismissedFindingIds: string[]
  intentionalFindingIds: string[]
  updatedAt?: string
}

export const SEMANTIC_VALIDATION_CATEGORY_LABELS = {
  "relationship-clarity": "Relationship clarity",
  "topology-quality": "Topology quality",
  "state-ownership": "State ownership",
  "async-integrity": "Async integrity",
  "security-integration": "Security / integration",
  "trust-boundaries": "Trust boundaries",
  "cross-layer-references": "Cross-layer references",
  "runtime-operations": "Runtime / operations",
  operability: "Operability",
  "ai-governance": "AI governance",
  safety: "Safety",
} as const satisfies Record<SemanticValidationCategory, string>

export const EMPTY_SEMANTIC_SCAN_STATE: SemanticScanState = {
  dismissedFindingIds: [],
  intentionalFindingIds: [],
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

function textLower(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

function hasAnyText(...values: unknown[]) {
  return values.some((value) => hasText(value))
}

function hasSensitiveDataMarker(node: CanvasNode) {
  const markers = [
    node.data.dataSensitivity,
    node.data.privacyClass,
    node.data.boundary,
  ]
    .map(textLower)
    .join(" ")
  return /\b(restricted|regulated|confidential|pii|personal|tenant)\b/.test(markers)
}

function hasDescriptionOrResponsibilities(node: CanvasNode): boolean {
  return hasText(node.data.description) || hasStringList(node.data.responsibilities)
}

function finding(input: {
  id: string
  category: SemanticValidationCategory
  severity?: SemanticValidationSeverity
  qualitySeverity?: SemanticQualitySeverity
  targetKind: SemanticValidationTargetKind
  targetId?: string
  field?: string
  message: string
}): SemanticValidationResult {
  const severity = input.severity ?? "warning"
  const blocking = severity === "error"

  return {
    id: input.id,
    severity,
    qualitySeverity:
      input.qualitySeverity ?? (severity === "info" ? "info" : "warning"),
    category: input.category,
    advisory: !blocking,
    blocking,
    targetKind: input.targetKind,
    targetId: input.targetId,
    field: input.field,
    message: input.message,
  }
}

export function normalizeSemanticScanState(value: unknown): SemanticScanState {
  if (!isRecord(value)) return EMPTY_SEMANTIC_SCAN_STATE

  const dismissedFindingIds = Array.isArray(value.dismissedFindingIds)
    ? value.dismissedFindingIds
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 500)
    : []
  const intentionalFindingIds = Array.isArray(value.intentionalFindingIds)
    ? value.intentionalFindingIds
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 500)
    : []
  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt.trim()
      ? value.updatedAt.trim()
      : undefined

  return { dismissedFindingIds, intentionalFindingIds, updatedAt }
}

export function isSemanticFindingHidden(
  findingResult: SemanticValidationResult,
  state: SemanticScanState
) {
  if (findingResult.blocking) return false
  return (
    state.dismissedFindingIds.includes(findingResult.id) ||
    state.intentionalFindingIds.includes(findingResult.id)
  )
}

export interface SemanticFindingSeveritySummary {
  totalFindings: number
  activeFindings: number
  hiddenFindings: number
  blockingFindings: number
  errorFindings: number
  warningFindings: number
  infoFindings: number
  problemFindings: number
  active: SemanticValidationResult[]
}

export function summarizeSemanticFindingSeverities(
  findings: SemanticValidationResult[],
  state: SemanticScanState = EMPTY_SEMANTIC_SCAN_STATE
): SemanticFindingSeveritySummary {
  const active = findings.filter((findingResult) => !isSemanticFindingHidden(findingResult, state))
  const errorFindings = active.filter((findingResult) => findingResult.severity === "error").length
  const warningFindings = active.filter((findingResult) => findingResult.severity === "warning").length
  const infoFindings = active.filter((findingResult) => findingResult.severity === "info").length

  return {
    totalFindings: findings.length,
    activeFindings: active.length,
    hiddenFindings: Math.max(0, findings.length - active.length),
    blockingFindings: active.filter((findingResult) => findingResult.blocking).length,
    errorFindings,
    warningFindings,
    infoFindings,
    problemFindings: errorFindings + warningFindings,
    active,
  }
}

export function groupSemanticFindings(findings: SemanticValidationResult[]) {
  const groups = new Map<SemanticValidationCategory, SemanticValidationResult[]>()
  for (const findingResult of findings) {
    groups.set(findingResult.category, [
      ...(groups.get(findingResult.category) ?? []),
      findingResult,
    ])
  }
  return groups
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
      results.push(finding({
        id: `${targetKind}-${targetId}-secret-${fieldPath}`,
        severity: "error",
        qualitySeverity: "high",
        category: "safety",
        targetKind,
        targetId,
        field: fieldPath,
        message: "Raw secret-looking value must be stored as a secretRef.",
      }))
      continue
    }

    if (typeof childValue === "string" && looksLikeRawSecretValue(childValue)) {
      results.push(finding({
        id: `${targetKind}-${targetId}-secret-value-${fieldPath}`,
        severity: "error",
        qualitySeverity: "high",
        category: "safety",
        targetKind,
        targetId,
        field: fieldPath,
        message: "Raw secret-looking value will not be exported.",
      }))
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
    results.push(finding({
      id: `node-${node.id}-unclassified`,
      category: "topology-quality",
      targetKind: "node",
      targetId: node.id,
      field: "semanticType",
      message: "Node is unclassified; add semantic meaning when you want stronger instructions.",
    }))
  }

  for (const field of definition.requiredFields) {
    if (!hasMeaningfulField(node, field)) {
      results.push(finding({
        id: `node-${node.id}-missing-${field}`,
        category: "topology-quality",
        targetKind: "node",
        targetId: node.id,
        field,
        message: `${definition.label} would be clearer with field: ${field}.`,
      }))
    }
  }

  if (!hasDescriptionOrResponsibilities(node)) {
    results.push(finding({
      id: `node-${node.id}-missing-responsibility`,
      category: "topology-quality",
      targetKind: "node",
      targetId: node.id,
      field: "responsibilities",
      message: `${definition.label} is missing responsibilities or a description.`,
    }))
  }

  if (semanticType === "database" && !hasText(node.data.owner)) {
    results.push(finding({
      id: `node-${node.id}-database-owner`,
      category: "state-ownership",
      targetKind: "node",
      targetId: node.id,
      field: "owner",
      message: "Database should declare an owner for stronger handoff prompts.",
    }))
  }

  if (semanticType === "object-store" && !hasStringList(node.data.dataOwned)) {
    results.push(finding({
      id: `node-${node.id}-object-store-data-owned`,
      category: "state-ownership",
      targetKind: "node",
      targetId: node.id,
      field: "dataOwned",
      message: "Object / File Store should note stored artifacts or data ownership.",
    }))
  }

  if (
    semanticType === "cache-store" &&
    !hasText(node.data.ttlPolicy) &&
    !hasText(node.data.invalidationNotes) &&
    !hasText(node.data.operationalNotes)
  ) {
    results.push(finding({
      id: `node-${node.id}-cache-ttl-invalidation`,
      category: "state-ownership",
      targetKind: "node",
      targetId: node.id,
      field: "operationalNotes",
      message: "Cache / Session Store should note TTL or invalidation assumptions.",
    }))
  }

  if (
    semanticType === "external-system" &&
    !hasText(node.data.securityNotes) &&
    !hasText(node.data.trustNotes) &&
    !hasText(node.data.authType) &&
    !hasText(node.data.authExpectation)
  ) {
    results.push(finding({
      id: `node-${node.id}-external-trust-notes`,
      category: "trust-boundaries",
      targetKind: "node",
      targetId: node.id,
      field: "securityNotes",
      message: "External System / Provider should note auth or trust assumptions.",
    }))
  }

  if (
    semanticType === "client-surface" &&
    (textLower(node.data.exposure) === "public" ||
      textLower(node.data.boundary) === "public") &&
    !hasText(node.data.securityNotes) &&
    !hasText(node.data.authExpectation) &&
    !hasText(node.data.authMode) &&
    !hasText(node.data.authStrategy)
  ) {
    results.push(finding({
      id: `node-${node.id}-client-surface-public-auth`,
      category: "trust-boundaries",
      targetKind: "node",
      targetId: node.id,
      field: "authExpectation",
      message: "Public Client Surface should note auth expectations or security assumptions.",
    }))
  }

  if (
    semanticType === "client-surface" &&
    !hasText(node.data.securityNotes) &&
    !hasText(node.data.authMode) &&
    !hasText(node.data.authStrategy) &&
    !hasText(node.data.authExpectation)
  ) {
    results.push(finding({
      id: `node-${node.id}-client-surface-security`,
      category: "security-integration",
      targetKind: "node",
      targetId: node.id,
      field: "securityNotes",
      message: "Client Surface should note auth path or security assumptions.",
    }))
  }

  if (
    hasSensitiveDataMarker(node) &&
    !hasAnyText(node.data.privacyClass, node.data.securityNotes, node.data.trustNotes)
  ) {
    results.push(finding({
      id: `node-${node.id}-sensitive-data-notes`,
      category: "trust-boundaries",
      targetKind: "node",
      targetId: node.id,
      field: "privacyClass",
      message: "Restricted or regulated data should carry privacy or security notes.",
    }))
  }

  if (
    semanticType === "worker" &&
    !hasText(node.data.retryPolicy) &&
    node.data.idempotencyRequired !== true &&
    !hasText(node.data.operationalNotes)
  ) {
    results.push(finding({
      id: `node-${node.id}-worker-retry-idempotency`,
      category: "async-integrity",
      targetKind: "node",
      targetId: node.id,
      field: "retryPolicy",
      message: "Worker / Job should capture retry or idempotency notes.",
    }))
  }

  if (
    (semanticType === "generic-component" || semanticType === "unclassified") &&
    !hasText(node.data.description)
  ) {
    results.push(finding({
      id: `node-${node.id}-generic-description`,
      category: "topology-quality",
      targetKind: "node",
      targetId: node.id,
      field: "description",
      message: `${definition.label} should include a short description.`,
    }))
  }

  if (
    node.data.hasChildLayer &&
    (node.data.decompositionStatus === "planned" ||
      node.data.lastLayerSummary === "Empty child layer")
  ) {
    results.push(finding({
      id: `node-${node.id}-empty-child-layer`,
      category: "topology-quality",
      targetKind: "node",
      targetId: node.id,
      field: "lastLayerSummary",
      message: "Node has a child layer, but its internals are still empty.",
    }))
  }

  const aiDescriptor = [
    node.data.semanticType,
    node.data.architectureType,
    node.data.llmSemanticType,
    node.data.originalSemanticType,
    node.data.label,
    node.data.name,
  ]
    .filter((item): item is string => typeof item === "string")
    .join(" ")
    .toLowerCase()
  if (
    /\b(ai|agent|llm|model)\b/.test(aiDescriptor) &&
    !hasText(node.data.securityNotes) &&
    !hasText(node.data.promptPackNotes) &&
    !hasText(node.data.toolAccessNotes) &&
    !hasText(node.data.safetyNotes)
  ) {
    results.push(finding({
      id: `node-${node.id}-ai-governance-notes`,
      category: "ai-governance",
      targetKind: "node",
      targetId: node.id,
      field: "securityNotes",
      message: "AI-like component should note safety or tool-access assumptions.",
    }))
  }

  if (
    semanticType === "runtime-deployment" &&
    (!hasText(node.data.runtimeKind) || !hasText(node.data.owner))
  ) {
    results.push(finding({
      id: `node-${node.id}-runtime-kind-owner`,
      category: "runtime-operations",
      targetKind: "node",
      targetId: node.id,
      field: "runtimeKind",
      message: "Runtime / Deployment Unit should note runtime kind and owner.",
    }))
  }

  if (
    semanticType === "observability-control" &&
    !hasStringList(node.data.signalTypes) &&
    !hasAnyText(node.data.observabilityNotes, node.data.operationalNotes, node.data.incidentNotes)
  ) {
    results.push(finding({
      id: `node-${node.id}-observability-signals`,
      category: "runtime-operations",
      targetKind: "node",
      targetId: node.id,
      field: "signalTypes",
      message: "Observability / Control Plane should note signal types or operational intent.",
    }))
  }

  if (
    semanticType === "ai-component" &&
    !hasAnyText(
      node.data.safetyNotes,
      node.data.securityNotes,
      node.data.trustNotes,
      node.data.privacyClass,
      node.data.promptPackNotes
    ) &&
    !hasStringList(node.data.toolAccess)
  ) {
    results.push(finding({
      id: `node-${node.id}-ai-component-governance`,
      category: "ai-governance",
      targetKind: "node",
      targetId: node.id,
      field: "safetyNotes",
      message: "AI Component should note safety, tool access, privacy, or security assumptions.",
    }))
  }

  if (semanticType === "reference-proxy") {
    const hasTarget =
      hasText(node.data.referencedNodeId) ||
      hasText(node.data.referencedEdgeId) ||
      textLower(node.data.referenceKind) === "graph"
    if (!hasText(node.data.referencedGraphId) || !hasTarget) {
      results.push(finding({
        id: `node-${node.id}-proxy-reference-target`,
        category: "cross-layer-references",
        targetKind: "node",
        targetId: node.id,
        field: "referencedGraphId",
        message: "Reference Proxy should point to a referenced graph plus node, edge, or graph target.",
      }))
    }
  }

  if (!node.data.subcanvasRef) {
    results.push(finding({
      id: `node-${node.id}-subcanvas-ref`,
      severity: "info",
      category: "topology-quality",
      targetKind: "node",
      targetId: node.id,
      field: "subcanvasRef",
      message: `${definition.label} can have an inner design layer; layer is not created yet.`,
    }))
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
    results.push(finding({
      id: `edge-${edge.id}-unclassified`,
      category: "relationship-clarity",
      targetKind: "edge",
      targetId: edge.id,
      field: "relationshipType",
      message: "Edge is untyped; choose a relationship type with technical meaning.",
    }))
  }

  for (const field of definition.requiredFields) {
    if (!hasMeaningfulField(edge, field)) {
      results.push(finding({
        id: `edge-${edge.id}-missing-${field}`,
        category: "relationship-clarity",
        targetKind: "edge",
        targetId: edge.id,
        field,
        message: `${definition.label} would be clearer with field: ${field}.`,
      }))
    }
  }

  const labels = edgeLabelTexts(edgeData).map((label) => label.toLowerCase())
  if (labels.length === 0 || labels.every((label) => !label.trim())) {
    results.push(finding({
      id: `edge-${edge.id}-missing-useful-label`,
      category: "relationship-clarity",
      targetKind: "edge",
      targetId: edge.id,
      field: "label",
      message: "Edge should include a useful label for handoff context.",
    }))
  } else if (labels.some((label) => ["uses", "connects", "link"].includes(label.trim()))) {
    results.push(finding({
      id: `edge-${edge.id}-vague-label`,
      category: "relationship-clarity",
      targetKind: "edge",
      targetId: edge.id,
      field: "label",
      message: "Edge label is vague; add a concrete operation, data, or event hint.",
    }))
  }

  const target = nodesById.get(edge.target)
  const targetType = normalizeSemanticNodeType(target?.data.semanticType)
  const source = nodesById.get(edge.source)
  const sourceType = normalizeSemanticNodeType(source?.data.semanticType)

  if (
    relationshipType === "calls" &&
    !hasAnyText(edgeData.mechanism, edgeData.protocol)
  ) {
    results.push(finding({
      id: `edge-${edge.id}-call-mechanism-protocol`,
      category: "relationship-clarity",
      targetKind: "edge",
      targetId: edge.id,
      field: "mechanism",
      message: "Calls edge should note mechanism or protocol when known.",
    }))
  }

  if (
    (relationshipType === "reads" || relationshipType === "writes") &&
    targetType !== "database" &&
    targetType !== "entity" &&
    targetType !== "domain-model" &&
    targetType !== "cache-store" &&
    targetType !== "object-store"
  ) {
    results.push(finding({
      id: `edge-${edge.id}-db-target`,
      category: "state-ownership",
      targetKind: "edge",
      targetId: edge.id,
      field: "target",
      message: `${definition.label} should target a database, entity, or domain model.`,
    }))
  }

  if (
    (relationshipType === "reads" || relationshipType === "writes") &&
    !hasText(edgeData.dataSubject)
  ) {
    results.push(finding({
      id: `edge-${edge.id}-data-subject`,
      category: "state-ownership",
      targetKind: "edge",
      targetId: edge.id,
      field: "dataSubject",
      message: `${definition.label} edge should identify the data subject.`,
    }))
  }

  if (relationshipType === "triggers" && targetType !== "worker") {
    results.push(finding({
      id: `edge-${edge.id}-worker-target`,
      category: "async-integrity",
      targetKind: "edge",
      targetId: edge.id,
      field: "target",
      message: "Invokes Worker should target a worker node.",
    }))
  }

  if (
    (relationshipType === "publishes" || relationshipType === "consumes") &&
    !hasText(edgeData.eventSubject) &&
    !hasText(edgeData.eventName) &&
    !hasText(edgeData.topic)
  ) {
    results.push(finding({
      id: `edge-${edge.id}-event-subject`,
      category: "async-integrity",
      targetKind: "edge",
      targetId: edge.id,
      field: "eventSubject",
      message: "Async publish/consume edge should identify an event subject or topic.",
    }))
  }

  if (
    relationshipType === "consumes" &&
    targetType === "worker" &&
    !hasAnyText(edgeData.retryPolicy, edgeData.idempotencyNotes)
  ) {
    results.push(finding({
      id: `edge-${edge.id}-consume-worker-retry-idempotency`,
      category: "async-integrity",
      targetKind: "edge",
      targetId: edge.id,
      field: "retryPolicy",
      message: "Consumes edge into a worker should note retry or idempotency assumptions.",
    }))
  }

  if (
    relationshipType === "authenticates_via" &&
    !hasAnyText(edgeData.securityNotes, edgeData.auth)
  ) {
    results.push(finding({
      id: `edge-${edge.id}-auth-security-notes`,
      category: "security-integration",
      targetKind: "edge",
      targetId: edge.id,
      field: "securityNotes",
      message: "Authenticates Via edge should capture security or scope notes.",
    }))
  }

  if (
    relationshipType === "runs_on" &&
    targetType === "runtime-deployment" &&
    !hasAnyText(target?.data.runtimeKind, target?.data.operationalNotes, edgeData.reliability)
  ) {
    results.push(finding({
      id: `edge-${edge.id}-runs-on-runtime-notes`,
      category: "runtime-operations",
      targetKind: "edge",
      targetId: edge.id,
      field: "runtimeKind",
      message: "Runs On edge should point to runtime notes or deployment assumptions.",
    }))
  }

  if (
    relationshipType === "monitors" &&
    !hasAnyText(edgeData.mechanism, edgeData.reliability, target?.data.observabilityNotes) &&
    !hasStringList(target?.data.signalTypes)
  ) {
    results.push(finding({
      id: `edge-${edge.id}-monitoring-signal-notes`,
      category: "runtime-operations",
      targetKind: "edge",
      targetId: edge.id,
      field: "reliability",
      message: "Monitors edge should note observed signals or operational mechanism.",
    }))
  }

  if (
    source?.data.boundary &&
    target?.data.boundary &&
    source.data.boundary !== target.data.boundary &&
    !hasText(edgeData.securityNotes) &&
    !hasText(edgeData.trustNotes)
  ) {
    results.push(finding({
      id: `edge-${edge.id}-boundary-trust-notes`,
      category: "trust-boundaries",
      targetKind: "edge",
      targetId: edge.id,
      field: "trustNotes",
      message: "Boundary-crossing data/event flow should note trust or security assumptions.",
    }))
  }

  if (
    (sourceType === "ai-component" || targetType === "ai-component") &&
    (sourceType === "external-system" || targetType === "external-system") &&
    !hasAnyText(edgeData.securityNotes, edgeData.trustNotes, source?.data.trustNotes, target?.data.trustNotes)
  ) {
    results.push(finding({
      id: `edge-${edge.id}-ai-external-trust-notes`,
      category: "ai-governance",
      targetKind: "edge",
      targetId: edge.id,
      field: "trustNotes",
      message: "AI Component connected to an external provider should note trust or security assumptions.",
    }))
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

  const proxyNodes = snapshot.nodes.filter(
    (node) => normalizeSemanticNodeType(node.data.semanticType) === "reference-proxy"
  )
  if (proxyNodes.length > 8) {
    results.push(finding({
      id: "canvas-many-reference-proxies",
      category: "cross-layer-references",
      targetKind: "canvas",
      field: "reference-proxy",
      message: "This layer has many Reference Proxy nodes; keep proxies contextual so ownership stays clear.",
    }))
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
      results.push(finding({
        id: `node-${node.id}-event-channel-producer-consumer`,
        category: "async-integrity",
        targetKind: "node",
        targetId: node.id,
        field: "relationshipType",
        message: "Event Channel should show producer or consumer relationships.",
      }))
    }
  }

  const labelsByText = new Map<string, CanvasNode[]>()
  for (const node of snapshot.nodes) {
    const label = (node.data.name || node.data.label || "").trim().toLowerCase()
    if (!label || ["service", "database", "component", "node"].includes(label)) {
      if (label) {
        results.push(finding({
          id: `node-${node.id}-vague-label`,
          category: "topology-quality",
          targetKind: "node",
          targetId: node.id,
          field: "label",
          message: "Node label is vague; use a concrete architecture name.",
        }))
      }
      continue
    }
    labelsByText.set(label, [...(labelsByText.get(label) ?? []), node])
  }

  for (const [label, duplicatedNodes] of labelsByText.entries()) {
    if (duplicatedNodes.length < 2) continue
    for (const node of duplicatedNodes) {
      results.push(finding({
        id: `node-${node.id}-duplicate-label-${label}`,
        category: "topology-quality",
        targetKind: "node",
        targetId: node.id,
        field: "label",
        message: `Duplicate node label "${node.data.name || node.data.label}" may make Prompt Pack references ambiguous.`,
      }))
    }
  }

  if (snapshot.nodes.length === 0 && snapshot.edges.length === 0) {
    results.push(finding({
      id: "canvas-empty",
      severity: "info",
      category: "topology-quality",
      targetKind: "canvas",
      message: "Canvas has no semantic architecture nodes yet.",
    }))
  }

  return results
}
