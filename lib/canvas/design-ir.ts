import type {
  CanvasEdge,
  CanvasEdgeData,
  CanvasNode,
  SemanticEdgeType,
  SemanticNodeType,
} from "@/types/canvas"
import {
  CANVAS_DOC_VERSION,
  DESIGN_IR_VERSION,
  SEMANTIC_TAXONOMY_VERSION,
  isSemanticEdgeType,
  isSemanticNodeType,
  normalizeEdgeRelationshipType,
  normalizeSemanticNodeType,
} from "@/types/canvas"
import type { CanvasDocV1, CanvasScopeKind } from "@/lib/canvas/canvas-doc"
import { createCanvasDocV1, normalizeCanvasDocV1 } from "@/lib/canvas/canvas-doc"
import {
  type CanvasSnapshot,
  sanitizeCanvasSnapshot,
} from "@/lib/canvas/canvas-state"
import {
  type SemanticValidationResult,
  validateCanvasSemantics,
} from "@/lib/canvas/semantic-validation"
import { ROOT_GRAPH_ID, isValidGraphId } from "@/lib/canvas/graph-ids"
import {
  looksLikeRawSecretValue,
  shouldStripSecretField,
} from "@/lib/canvas/secret-guards"

export const DESIGN_IR_SCHEMA_URL =
  "https://arcforge.dev/schemas/design-ir.v1.json" as const

export type DesignIrStatus = "valid" | "has-warnings" | "draft"

export interface DesignIrProject {
  id: string
  name: string
  tenantModel: "owner-scoped-now-workspace-compatible-later"
  defaultRuntime: "node-typescript"
  defaultDatabase: "postgresql"
  defaultOrm: "prisma"
}

export interface DesignIrScope {
  rootGraphId: string
  compiledGraphIds: string[]
  rootOnly: boolean
}

export interface DesignIrGraph {
  graphId: string
  title: string
  scopeKind: CanvasScopeKind
  parentGraphId?: string | null
  parentNodeId: string | null
  layer?: number | null
  layerKind?: string | null
  summary?: string | null
  parentServiceId?: string
  parentServiceName?: string
  nodeCount: number
  edgeCount: number
}

export interface DesignIrNode {
  id: string
  name: string
  semanticType: SemanticNodeType
  sourceGraphId: string
  graphScopeKind: CanvasScopeKind
  description: string
  status: string
  tags: string[]
  metadata: Record<string, unknown>
  parentServiceId?: string
  parentServiceName?: string
}

export interface DesignIrRelation {
  id: string
  source: string
  target: string
  kind: SemanticEdgeType
  semanticType: SemanticEdgeType
  label: string
  labels: string[]
  sourceGraphId: string
  sourceNodeType: SemanticNodeType | "unknown"
  targetNodeType: SemanticNodeType | "unknown"
  metadata: Record<string, unknown>
}

export interface DesignIrDecision {
  id: string
  sourceId: string
  sourceGraphId: string
}

export interface DesignIrValidationResult extends SemanticValidationResult {
  sourceGraphId?: string
}

export interface DesignIrValidationSummary {
  status: DesignIrStatus
  total: number
  errors: number
  warnings: number
  info: number
}

export interface DesignIrProvenance {
  compiler: "arc-forge-design-ir"
  compilerVersion: typeof DESIGN_IR_VERSION
  source: "CanvasDoc v1"
  canvasDocVersion: typeof CANVAS_DOC_VERSION
  semanticTaxonomyVersion: typeof SEMANTIC_TAXONOMY_VERSION
  deterministic: true
  validationIncluded: boolean
}

export interface DesignIrV1 {
  $schema: typeof DESIGN_IR_SCHEMA_URL
  irVersion: typeof DESIGN_IR_VERSION
  project: DesignIrProject
  scope: DesignIrScope
  graphs: DesignIrGraph[]
  services: DesignIrNode[]
  apis: DesignIrNode[]
  endpoints: DesignIrNode[]
  dataModels: DesignIrNode[]
  workers: DesignIrNode[]
  events: DesignIrNode[]
  policies: DesignIrNode[]
  businessRules: DesignIrNode[]
  validationRules: DesignIrNode[]
  actors: DesignIrNode[]
  frontends: DesignIrNode[]
  genericComponents: DesignIrNode[]
  externalSystems: DesignIrNode[]
  notes: DesignIrNode[]
  unclassifiedNodes: DesignIrNode[]
  relations: DesignIrRelation[]
  decisions: DesignIrDecision[]
  assumptions: string[]
  sourceRefs: string[]
  validation: DesignIrValidationResult[]
  validationSummary: DesignIrValidationSummary
  provenance: DesignIrProvenance
}

export interface DesignIrCompileOptions {
  projectId?: string
  projectName?: string
  rootOnly?: boolean
  includeValidation?: boolean
  externalValidation?: DesignIrValidationResult[]
}

export interface DesignIrCompileResult {
  ir: DesignIrV1
  validation: DesignIrValidationResult[]
  status: DesignIrStatus
  graphCount: number
  summary: string
}

interface SanitizerContext {
  sourceGraphId: string
  targetKind: "node" | "edge"
  targetId: string
  warnings: DesignIrValidationResult[]
}

const OMITTED_METADATA_KEYS = new Set([
  "color",
  "textColor",
  "shape",
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
  "graphId",
  "graphScopeKind",
  "parentServiceId",
  "parentServiceName",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isCanvasDoc(value: CanvasSnapshot | CanvasDocV1): value is CanvasDocV1 {
  return "$schema" in value && "docVersion" in value
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, "en")
}

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))].sort(
    compareText
  )
}

function validationSortKey(result: DesignIrValidationResult) {
  const severityRank = result.severity === "error" ? 0 : result.severity === "warning" ? 1 : 2
  return `${severityRank}:${result.sourceGraphId ?? ""}:${result.targetKind}:${result.targetId ?? ""}:${result.id}`
}

function sortValidation(results: DesignIrValidationResult[]) {
  return [...results].sort((a, b) => compareText(validationSortKey(a), validationSortKey(b)))
}

function sortNodes(nodes: DesignIrNode[]): DesignIrNode[] {
  return [...nodes].sort((a, b) =>
    compareText(`${a.sourceGraphId}:${a.id}`, `${b.sourceGraphId}:${b.id}`)
  )
}

function sortRelations(relations: DesignIrRelation[]): DesignIrRelation[] {
  return [...relations].sort((a, b) =>
    compareText(`${a.sourceGraphId}:${a.id}`, `${b.sourceGraphId}:${b.id}`)
  )
}

function nodeName(node: CanvasNode): string {
  const name = node.data.name?.trim()
  if (name) return name
  const label = node.data.label?.trim()
  return label || node.id
}

function graphSort(docs: CanvasDocV1[], rootGraphId: string) {
  return [...docs].sort((a, b) => {
    if (a.graphId === rootGraphId) return -1
    if (b.graphId === rootGraphId) return 1
    return compareText(a.graphId, b.graphId)
  })
}

function normalizeInputDoc(
  input: CanvasSnapshot | CanvasDocV1,
  options: DesignIrCompileOptions = {}
): CanvasDocV1 {
  return isCanvasDoc(input)
    ? normalizeCanvasDocV1(input, { projectId: options.projectId })
    : createCanvasDocV1(sanitizeCanvasSnapshot(input), {
        projectId: options.projectId ?? "",
      })
}

function warningPath(path: string) {
  return path.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "value"
}

function pushSecretWarning(
  context: SanitizerContext,
  field: string,
  message: string
) {
  context.warnings.push({
    id: `${context.sourceGraphId}-${context.targetKind}-${context.targetId}-secret-${warningPath(field)}`,
    severity: "warning",
    category: "safety",
    advisory: true,
    blocking: false,
    targetKind: context.targetKind,
    targetId: context.targetId,
    sourceGraphId: context.sourceGraphId,
    field,
    message,
  })
}

function cleanExportValue(
  key: string,
  value: unknown,
  context: SanitizerContext,
  fieldPath: string
): unknown {
  if (shouldStripSecretField(key, value)) {
    pushSecretWarning(
      context,
      fieldPath,
      "Raw secret-looking field was removed from Design IR export; store it as a secretRef."
    )
    return undefined
  }

  if (typeof value === "string") {
    if (looksLikeRawSecretValue(value)) {
      pushSecretWarning(
        context,
        fieldPath,
        "Raw secret-looking value was redacted from Design IR export."
      )
      return "[redacted-secret]"
    }

    if (value === "[redacted-secret]") {
      pushSecretWarning(
        context,
        fieldPath,
        "Raw secret-looking value was redacted before Design IR export."
      )
    }

    return value
  }

  if (Array.isArray(value)) {
    return value
      .map((item, index) => cleanExportValue(key, item, context, `${fieldPath}.${index}`))
      .filter((item) => item !== undefined)
  }

  if (isRecord(value)) {
    const output: Record<string, unknown> = {}
    for (const childKey of Object.keys(value).sort(compareText)) {
      const clean = cleanExportValue(childKey, value[childKey], context, `${fieldPath}.${childKey}`)
      if (clean !== undefined) output[childKey] = clean
    }
    return output
  }

  return value
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isRecord(value)) return value

  const output: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort(compareText)) {
    output[key] = stableValue(value[key])
  }
  return output
}

function exportMetadata(
  data: Record<string, unknown>,
  context: SanitizerContext
): Record<string, unknown> {
  const output: Record<string, unknown> = {}

  for (const key of Object.keys(data).sort(compareText)) {
    if (OMITTED_METADATA_KEYS.has(key)) continue
    const clean = cleanExportValue(key, data[key], context, `data.${key}`)
    if (clean !== undefined) output[key] = stableValue(clean)
  }

  return output
}

function semanticNodeType(value: unknown): SemanticNodeType {
  return normalizeSemanticNodeType(value) ?? (isSemanticNodeType(value) ? value : "unclassified")
}

function semanticEdgeType(value: unknown): SemanticEdgeType {
  return normalizeEdgeRelationshipType(value) ?? (isSemanticEdgeType(value) ? value : "unclassified")
}

function collectLabels(edge: CanvasEdge): string[] {
  const data: CanvasEdgeData = edge.data ?? {}
  const labels: string[] = []

  if (Array.isArray(data.labelItems)) {
    for (const item of data.labelItems) {
      if (typeof item.text === "string" && item.text.trim()) labels.push(item.text.trim())
    }
  }

  if (Array.isArray(data.labels)) {
    for (const label of data.labels) {
      if (typeof label === "string" && label.trim()) labels.push(label.trim())
    }
  }

  if (typeof data.label === "string" && data.label.trim()) labels.push(data.label.trim())

  const deduped: string[] = []
  for (const label of labels) {
    if (!deduped.includes(label)) deduped.push(label)
  }
  return deduped
}

function toIrNode(
  node: CanvasNode,
  doc: CanvasDocV1,
  parent: { parentServiceId?: string; parentServiceName?: string } | undefined,
  warnings: DesignIrValidationResult[]
): DesignIrNode {
  const context: SanitizerContext = {
    sourceGraphId: doc.graphId,
    targetKind: "node",
    targetId: node.id,
    warnings,
  }
  const semanticType = semanticNodeType(node.data.semanticType)
  const baseNode: DesignIrNode = {
    id: node.id,
    name: nodeName(node),
    semanticType,
    sourceGraphId: doc.graphId,
    graphScopeKind: doc.scopeKind,
    description: node.data.description?.trim() ?? "",
    status: node.data.status ?? "draft",
    tags: [...(node.data.tags ?? [])].sort(compareText),
    metadata: exportMetadata(node.data, context),
  }

  if (parent?.parentServiceId) baseNode.parentServiceId = parent.parentServiceId
  if (parent?.parentServiceName) baseNode.parentServiceName = parent.parentServiceName

  return baseNode
}

function toIrRelation(
  edge: CanvasEdge,
  doc: CanvasDocV1,
  nodesByGraphAndId: Map<string, CanvasNode>,
  warnings: DesignIrValidationResult[]
): DesignIrRelation {
  const data: CanvasEdgeData = edge.data ?? {}
  const labels = collectLabels(edge)
  const context: SanitizerContext = {
    sourceGraphId: doc.graphId,
    targetKind: "edge",
    targetId: edge.id,
    warnings,
  }
  const kind = semanticEdgeType(data.relationshipType ?? data.semanticType)
  const sourceNodeType = semanticNodeType(
    nodesByGraphAndId.get(`${doc.graphId}:${edge.source}`)?.data.semanticType
  )
  const targetNodeType = semanticNodeType(
    nodesByGraphAndId.get(`${doc.graphId}:${edge.target}`)?.data.semanticType
  )
  const hasSource = nodesByGraphAndId.has(`${doc.graphId}:${edge.source}`)
  const hasTarget = nodesByGraphAndId.has(`${doc.graphId}:${edge.target}`)

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    kind,
    semanticType: kind,
    label: labels[0] ?? "",
    labels,
    sourceGraphId: doc.graphId,
    sourceNodeType: hasSource ? sourceNodeType : "unknown",
    targetNodeType: hasTarget ? targetNodeType : "unknown",
    metadata: exportMetadata(data, context),
  }
}

function collectStrings(
  items: Array<CanvasNode | CanvasEdge>,
  field: "assumptions" | "sourceRefs"
) {
  const values: string[] = []
  for (const item of items) {
    const raw = item.data?.[field]
    if (!Array.isArray(raw)) continue
    for (const value of raw) {
      if (typeof value === "string" && value.trim()) values.push(value.trim())
    }
  }
  return uniqueSorted(values)
}

function collectDecisions(docs: CanvasDocV1[]): DesignIrDecision[] {
  const decisions: DesignIrDecision[] = []

  for (const doc of docs) {
    for (const item of [...doc.nodes, ...doc.edges]) {
      const refs = item.data?.decisionRefs ?? []
      for (const ref of refs) {
        if (ref.trim()) {
          decisions.push({
            id: ref.trim(),
            sourceId: item.id,
            sourceGraphId: doc.graphId,
          })
        }
      }
    }
  }

  return decisions.sort((a, b) =>
    compareText(`${a.sourceGraphId}:${a.id}:${a.sourceId}`, `${b.sourceGraphId}:${b.id}:${b.sourceId}`)
  )
}

function findRootDoc(docs: CanvasDocV1[]) {
  return (
    docs.find((doc) => doc.graphId === ROOT_GRAPH_ID) ??
    docs.find((doc) => doc.scopeKind === "system-root") ??
    docs[0]
  )
}

function parentServiceForDocs(rootDoc: CanvasDocV1, docs: CanvasDocV1[]) {
  const rootNodesById = new Map(rootDoc.nodes.map((node) => [node.id, node]))
  const parentByGraphId = new Map<string, { parentServiceId?: string; parentServiceName?: string }>()

  for (const doc of docs) {
    if (doc.graphId === rootDoc.graphId) continue
    const parentNode =
      (doc.parentNodeId ? rootNodesById.get(doc.parentNodeId) : undefined) ??
      rootDoc.nodes.find((node) => node.data.subcanvasRef?.graphId === doc.graphId)

    if (parentNode && semanticNodeType(parentNode.data.semanticType) === "service") {
      parentByGraphId.set(doc.graphId, {
        parentServiceId: parentNode.id,
        parentServiceName: nodeName(parentNode),
      })
    }
  }

  return parentByGraphId
}

function graphValidationWarnings(
  docs: CanvasDocV1[],
  rootDoc: CanvasDocV1,
  rootOnly: boolean
): DesignIrValidationResult[] {
  const docIds = new Set(docs.map((doc) => doc.graphId))
  const warnings: DesignIrValidationResult[] = []

  for (const doc of docs) {
    if (!isValidGraphId(doc.graphId)) {
      warnings.push({
        id: `${doc.graphId}-invalid-graph-id`,
        severity: "warning",
        category: "topology-quality",
        advisory: true,
        blocking: false,
        targetKind: "canvas",
        sourceGraphId: doc.graphId,
        field: "graphId",
        message: `Canvas graph has invalid graphId: ${doc.graphId}.`,
      })
    }

    if (doc.graphId !== rootDoc.graphId && !doc.parentNodeId) {
      warnings.push({
        id: `${doc.graphId}-missing-parent-node-id`,
        severity: "warning",
        category: "topology-quality",
        advisory: true,
        blocking: false,
        targetKind: "canvas",
        sourceGraphId: doc.graphId,
        field: "parentNodeId",
        message: "Child graph is missing parentNodeId.",
      })
    }
  }

  for (const node of rootDoc.nodes) {
    const ref = node.data.subcanvasRef
    if (!ref) continue

    if (!ref.graphId) {
      warnings.push({
        id: `${rootDoc.graphId}-node-${node.id}-subcanvas-ref-missing-graph`,
        severity: "warning",
        category: "topology-quality",
        advisory: true,
        blocking: false,
        targetKind: "node",
        targetId: node.id,
        sourceGraphId: rootDoc.graphId,
        field: "subcanvasRef.graphId",
        message: "Node subcanvasRef is missing graphId.",
      })
      continue
    }

    if (!isValidGraphId(ref.graphId)) {
      warnings.push({
        id: `${rootDoc.graphId}-node-${node.id}-invalid-subcanvas-graph-id`,
        severity: "warning",
        category: "topology-quality",
        advisory: true,
        blocking: false,
        targetKind: "node",
        targetId: node.id,
        sourceGraphId: rootDoc.graphId,
        field: "subcanvasRef.graphId",
        message: `Node subcanvasRef has invalid graphId: ${ref.graphId}.`,
      })
      continue
    }

    if (!rootOnly && !docIds.has(ref.graphId)) {
      warnings.push({
        id: `${rootDoc.graphId}-node-${node.id}-missing-child-graph`,
        severity: "warning",
        category: "topology-quality",
        advisory: true,
        blocking: false,
        targetKind: "node",
        targetId: node.id,
        sourceGraphId: rootDoc.graphId,
        field: "subcanvasRef.graphId",
        message: `Referenced child graph was not found: ${ref.graphId}.`,
      })
    }
  }

  return warnings
}

function validationForDocs(
  docs: CanvasDocV1[],
  extraWarnings: DesignIrValidationResult[]
): DesignIrValidationResult[] {
  const results: DesignIrValidationResult[] = []

  for (const doc of docs) {
    for (const result of validateCanvasSemantics({ nodes: doc.nodes, edges: doc.edges })) {
      results.push({
        ...result,
        id: `${doc.graphId}:${result.id}`,
        sourceGraphId: doc.graphId,
      })
    }
  }

  return sortValidation([...results, ...extraWarnings])
}

function validationSummary(
  validation: DesignIrValidationResult[],
  status: DesignIrStatus
): DesignIrValidationSummary {
  return {
    status,
    total: validation.length,
    errors: validation.filter((item) => item.severity === "error").length,
    warnings: validation.filter((item) => item.severity === "warning").length,
    info: validation.filter((item) => item.severity === "info").length,
  }
}

function deriveStatus(
  validation: DesignIrValidationResult[],
  unclassifiedNodes: DesignIrNode[],
  relations: DesignIrRelation[]
): DesignIrStatus {
  const actionable = validation.filter((item) => item.severity !== "info")
  const hasUnclassifiedRelation = relations.some((relation) => relation.kind === "unclassified")
  const hasDraftGraphIssue = actionable.some((item) =>
    [
      "unclassified",
      "missing-child-graph",
      "invalid-subcanvas-graph-id",
      "invalid-graph-id",
      "missing-parent-node-id",
      "subcanvas-ref-missing-graph",
    ].some((needle) => item.id.includes(needle))
  )

  if (unclassifiedNodes.length > 0 || hasUnclassifiedRelation || hasDraftGraphIssue) {
    return "draft"
  }
  return actionable.length > 0 ? "has-warnings" : "valid"
}

function summarizeDesignIr(ir: DesignIrV1): string {
  const graphText = ir.graphs.length === 1 ? "1 graph" : `${ir.graphs.length} graphs`
  const serviceText =
    ir.services.length === 1 ? "1 service" : `${ir.services.length} services`
  const endpointText =
    ir.endpoints.length === 1 ? "1 endpoint" : `${ir.endpoints.length} endpoints`
  const relationText =
    ir.relations.length === 1 ? "1 relation" : `${ir.relations.length} relations`
  const warningText =
    ir.validationSummary.warnings + ir.validationSummary.errors === 0
      ? "no blocking export warnings"
      : `${ir.validationSummary.warnings} warnings and ${ir.validationSummary.errors} errors`

  return `${ir.project.name} compiles ${graphText} into ${serviceText}, ${endpointText}, and ${relationText}; status is ${ir.validationSummary.status} with ${warningText}.`
}

function buildGraphs(
  docs: CanvasDocV1[],
  parentByGraphId: Map<string, { parentServiceId?: string; parentServiceName?: string }>
): DesignIrGraph[] {
  return docs.map((doc) => {
    const parent = parentByGraphId.get(doc.graphId)
    const graph: DesignIrGraph = {
      graphId: doc.graphId,
      title: doc.title,
      scopeKind: doc.scopeKind,
      parentGraphId: doc.parentGraphId,
      parentNodeId: doc.parentNodeId,
      layer: doc.layer,
      layerKind: doc.layerKind,
      summary: doc.summary,
      nodeCount: doc.nodes.length,
      edgeCount: doc.edges.length,
    }
    if (parent?.parentServiceId) graph.parentServiceId = parent.parentServiceId
    if (parent?.parentServiceName) graph.parentServiceName = parent.parentServiceName
    return graph
  })
}

export function compileCanvasDocsToDesignIrResult(
  docs: CanvasDocV1[],
  options: DesignIrCompileOptions = {}
): DesignIrCompileResult {
  const normalizedDocs = docs.map((doc) =>
    normalizeCanvasDocV1(doc, { projectId: options.projectId })
  )
  const rootDoc = findRootDoc(normalizedDocs)

  if (!rootDoc) {
    return compileCanvasToDesignIrResult({ nodes: [], edges: [] }, options)
  }

  const sortedDocs = graphSort(normalizedDocs, rootDoc.graphId)
  const parentByGraphId = parentServiceForDocs(rootDoc, sortedDocs)
  const exportWarnings: DesignIrValidationResult[] = []
  const nodesByGraphAndId = new Map<string, CanvasNode>()

  for (const doc of sortedDocs) {
    for (const node of doc.nodes) {
      nodesByGraphAndId.set(`${doc.graphId}:${node.id}`, node)
    }
  }

  const irNodes = sortedDocs
    .flatMap((doc) =>
      doc.nodes.map((node) =>
        toIrNode(node, doc, parentByGraphId.get(doc.graphId), exportWarnings)
      )
    )
    .sort((a, b) => compareText(`${a.sourceGraphId}:${a.id}`, `${b.sourceGraphId}:${b.id}`))

  const relations = sortRelations(
    sortedDocs.flatMap((doc) =>
      doc.edges.map((edge) => toIrRelation(edge, doc, nodesByGraphAndId, exportWarnings))
    )
  )

  const graphWarnings = graphValidationWarnings(sortedDocs, rootDoc, Boolean(options.rootOnly))
  const fullValidation = validationForDocs(sortedDocs, [
    ...graphWarnings,
    ...exportWarnings,
    ...(options.externalValidation ?? []),
  ])
  const visibleValidation = options.includeValidation === false ? [] : fullValidation
  const allCanvasItems = sortedDocs.flatMap((doc) => [...doc.nodes, ...doc.edges])
  const compiledGraphIds = sortedDocs.map((doc) => doc.graphId)
  const unclassifiedNodes = sortNodes(
    irNodes.filter((node) => node.semanticType === "unclassified")
  )
  const status = deriveStatus(fullValidation, unclassifiedNodes, relations)
  const summaryShell = validationSummary(visibleValidation, status)

  const ir: DesignIrV1 = {
    $schema: DESIGN_IR_SCHEMA_URL,
    irVersion: DESIGN_IR_VERSION,
    project: {
      id: rootDoc.projectId,
      name: options.projectName ?? rootDoc.title,
      tenantModel: "owner-scoped-now-workspace-compatible-later",
      defaultRuntime: "node-typescript",
      defaultDatabase: "postgresql",
      defaultOrm: "prisma",
    },
    scope: {
      rootGraphId: rootDoc.graphId,
      compiledGraphIds,
      rootOnly: Boolean(options.rootOnly),
    },
    graphs: buildGraphs(sortedDocs, parentByGraphId),
    services: sortNodes(irNodes.filter((node) => node.semanticType === "service")),
    apis: sortNodes(
      irNodes.filter((node) => ["api", "endpoint-group"].includes(node.semanticType))
    ),
    endpoints: sortNodes(irNodes.filter((node) => node.semanticType === "endpoint")),
    dataModels: sortNodes(
      irNodes.filter((node) =>
        [
          "database",
          "domain-model",
          "entity",
          "cache",
          "queue",
          "cache-store",
          "object-store",
        ].includes(node.semanticType)
      )
    ),
    workers: sortNodes(irNodes.filter((node) => node.semanticType === "worker")),
    events: sortNodes(
      irNodes.filter((node) =>
        ["event-contract", "event-channel", "queue"].includes(node.semanticType)
      )
    ),
    policies: sortNodes(
      irNodes.filter((node) =>
        ["policy", "identity-auth", "auth-module"].includes(node.semanticType)
      )
    ),
    businessRules: sortNodes(
      irNodes.filter((node) => node.semanticType === "business-rule")
    ),
    validationRules: sortNodes(
      irNodes.filter((node) => node.semanticType === "validation-rule")
    ),
    actors: sortNodes(irNodes.filter((node) => node.semanticType === "actor")),
    frontends: sortNodes(
      irNodes.filter((node) =>
        ["client-surface", "frontend"].includes(node.semanticType)
      )
    ),
    genericComponents: sortNodes(
      irNodes.filter((node) => node.semanticType === "generic-component")
    ),
    externalSystems: sortNodes(
      irNodes.filter((node) => node.semanticType === "external-system")
    ),
    notes: sortNodes(irNodes.filter((node) => node.semanticType === "spec-note")),
    unclassifiedNodes,
    relations,
    decisions: collectDecisions(sortedDocs),
    assumptions: collectStrings(allCanvasItems, "assumptions"),
    sourceRefs: collectStrings(allCanvasItems, "sourceRefs"),
    validation: visibleValidation,
    validationSummary: summaryShell,
    provenance: {
      compiler: "arc-forge-design-ir",
      compilerVersion: DESIGN_IR_VERSION,
      source: "CanvasDoc v1",
      canvasDocVersion: CANVAS_DOC_VERSION,
      semanticTaxonomyVersion: SEMANTIC_TAXONOMY_VERSION,
      deterministic: true,
      validationIncluded: options.includeValidation !== false,
    },
  }

  return {
    ir,
    validation: visibleValidation,
    status,
    graphCount: sortedDocs.length,
    summary: summarizeDesignIr(ir),
  }
}

export function compileCanvasToDesignIrResult(
  input: CanvasSnapshot | CanvasDocV1,
  options: DesignIrCompileOptions = {}
): DesignIrCompileResult {
  const doc = normalizeInputDoc(input, options)
  return compileCanvasDocsToDesignIrResult([doc], options)
}

export function compileCanvasToDesignIrV1(
  input: CanvasSnapshot | CanvasDocV1,
  options: DesignIrCompileOptions = {}
): DesignIrV1 {
  return compileCanvasToDesignIrResult(input, options).ir
}

export function compileCanvasDocsToDesignIrV1(
  docs: CanvasDocV1[],
  options: DesignIrCompileOptions = {}
): DesignIrV1 {
  return compileCanvasDocsToDesignIrResult(docs, options).ir
}
