import { createCanvasDocV1, type CanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { emptyCanvasSnapshot } from "@/lib/canvas/canvas-state"
import { readCanvasDoc } from "@/lib/canvas/canvas-persistence"
import { ROOT_GRAPH_ID, isValidGraphId } from "@/lib/canvas/graph-ids"
import {
  SEMANTIC_VALIDATION_CATEGORY_LABELS,
  groupSemanticFindings,
  validateCanvasSemantics,
} from "@/lib/canvas/semantic-validation"
import {
  summarizeEdgeMetadataForLlm,
  summarizeNodeMetadataForLlm,
} from "@/lib/canvas/metadata-summaries"
import {
  graphSummaryCacheFromDoc,
  type GraphSummaryCache,
} from "@/lib/canvas/graph-summary-cache"
import {
  canvasActivityFromDoc,
  type CanvasActivityPanel,
} from "@/lib/canvas/canvas-activity"
import {
  looksLikeRawSecretValue,
  shouldStripSecretField,
} from "@/lib/canvas/secret-guards"

export const LLM_TRANSPORT_TRANSIENT_KEYS = new Set([
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
  "popover",
  "popovers",
  "lasso",
  "lassoRectangle",
  "temporaryReconnectLine",
  "presence",
  "cursor",
  "cursors",
])

export interface CanvasPyramidNode {
  id: string
  type?: string
  position: { x: number; y: number }
  width?: number
  height?: number
  data: Record<string, unknown>
  metadataSummary: Record<string, unknown>
}

export interface CanvasPyramidEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  type?: string
  data: Record<string, unknown>
  metadataSummary: Record<string, unknown>
}

export interface CanvasPyramidSemanticScanSummary {
  activeCount: number
  blockingCount: number
  groupedCounts: Array<{
    category: string
    label: string
    count: number
    highCount: number
    blockingCount: number
  }>
  findings: Array<{
    id: string
    category: string
    severity: string
    advisory: boolean
    blocking: boolean
    targetKind: string
    targetId?: string
    message: string
  }>
}

export interface CanvasPyramidGraph {
  graphId: string
  title: string
  scopeKind: string
  parentGraphId: string | null
  parentNodeId: string | null
  layer: number | null
  layerKind: string | null
  summary: string | null
  nodes: CanvasPyramidNode[]
  edges: CanvasPyramidEdge[]
  semanticScan: CanvasPyramidSemanticScanSummary
  graphSummaryCache: GraphSummaryCache
  appActivity: CanvasActivityPanel
}

export interface CanvasPyramidGraphIndexEntry {
  graphId: string
  title: string
  parentGraphId: string | null
  parentNodeId: string | null
  layer: number | null
  layerKind: string | null
  nodeCount: number
  edgeCount: number
  summary: string
}

export interface CanvasPyramid {
  projectId: string
  rootGraphId: typeof ROOT_GRAPH_ID
  graphs: CanvasPyramidGraph[]
  graphIndex: CanvasPyramidGraphIndexEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function sanitizePosition(value: unknown) {
  if (!isRecord(value)) return { x: 0, y: 0 }
  return {
    x: typeof value.x === "number" && Number.isFinite(value.x) ? value.x : 0,
    y: typeof value.y === "number" && Number.isFinite(value.y) ? value.y : 0,
  }
}

export function sanitizeLlmTransportValue(
  value: unknown,
  key = ""
): unknown {
  if (LLM_TRANSPORT_TRANSIENT_KEYS.has(key)) return undefined
  if (shouldStripSecretField(key, value)) return undefined

  if (typeof value === "string") {
    return looksLikeRawSecretValue(value) ? "[redacted-secret]" : value
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeLlmTransportValue(item, key))
      .filter((item) => item !== undefined)
  }

  if (isRecord(value)) {
    const next: Record<string, unknown> = {}
    for (const [childKey, childValue] of Object.entries(value)) {
      const sanitized = sanitizeLlmTransportValue(childValue, childKey)
      if (sanitized !== undefined) next[childKey] = sanitized
    }
    return next
  }

  return value
}

export function sanitizeLlmTransportRecord(
  value: unknown
): Record<string, unknown> {
  const sanitized = sanitizeLlmTransportValue(value)
  return isRecord(sanitized) ? sanitized : {}
}

function sanitizeNode(node: CanvasDocV1["nodes"][number]): CanvasPyramidNode {
  return {
    id: node.id,
    type: node.type,
    position: sanitizePosition(node.position),
    width: typeof node.width === "number" ? node.width : undefined,
    height: typeof node.height === "number" ? node.height : undefined,
    data: sanitizeLlmTransportRecord(node.data),
    metadataSummary: sanitizeLlmTransportRecord(summarizeNodeMetadataForLlm(node)),
  }
}

function sanitizeEdge(edge: CanvasDocV1["edges"][number]): CanvasPyramidEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    type: edge.type,
    data: sanitizeLlmTransportRecord(edge.data ?? {}),
    metadataSummary: sanitizeLlmTransportRecord(summarizeEdgeMetadataForLlm(edge)),
  }
}

function semanticScanSummary(doc: CanvasDocV1): CanvasPyramidSemanticScanSummary {
  const findings = validateCanvasSemantics({ nodes: doc.nodes, edges: doc.edges })
  const grouped = groupSemanticFindings(findings)

  return {
    activeCount: findings.length,
    blockingCount: findings.filter((finding) => finding.blocking).length,
    groupedCounts: [...grouped.entries()].map(([category, groupFindings]) => ({
      category,
      label: SEMANTIC_VALIDATION_CATEGORY_LABELS[category],
      count: groupFindings.length,
      highCount: groupFindings.filter((finding) => finding.qualitySeverity === "high")
        .length,
      blockingCount: groupFindings.filter((finding) => finding.blocking).length,
    })),
    findings: findings.slice(0, 30).map((finding) => ({
      id: finding.id,
      category: finding.category,
      severity: finding.qualitySeverity ?? finding.severity,
      advisory: finding.advisory,
      blocking: finding.blocking,
      targetKind: finding.targetKind,
      targetId: finding.targetId,
      message: finding.message,
    })),
  }
}

function graphFromDoc(doc: CanvasDocV1): CanvasPyramidGraph {
  return {
    graphId: doc.graphId,
    title: doc.title,
    scopeKind: doc.scopeKind,
    parentGraphId: doc.parentGraphId,
    parentNodeId: doc.parentNodeId,
    layer: doc.layer,
    layerKind: doc.layerKind,
    summary: doc.summary,
    nodes: doc.nodes.map(sanitizeNode),
    edges: doc.edges.map(sanitizeEdge),
    semanticScan: semanticScanSummary(doc),
    graphSummaryCache: graphSummaryCacheFromDoc(doc),
    appActivity: canvasActivityFromDoc(doc),
  }
}

function childGraphIds(doc: CanvasDocV1) {
  return doc.nodes
    .map((node) => node.data.subcanvasRef?.graphId)
    .filter((graphId): graphId is string => Boolean(graphId?.trim()))
    .filter((graphId) => isValidGraphId(graphId))
}

function graphIndexEntry(graph: CanvasPyramidGraph): CanvasPyramidGraphIndexEntry {
  return {
    graphId: graph.graphId,
    title: graph.title,
    parentGraphId: graph.parentGraphId,
    parentNodeId: graph.parentNodeId,
    layer: graph.layer,
    layerKind: graph.layerKind,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    summary: graph.graphSummaryCache.summary,
  }
}

export function buildCanvasPyramidFromDocs(
  projectId: string,
  docs: CanvasDocV1[]
): CanvasPyramid {
  const graphs = docs.map(graphFromDoc)
  return {
    projectId,
    rootGraphId: ROOT_GRAPH_ID,
    graphs,
    graphIndex: graphs.map(graphIndexEntry),
  }
}

export async function loadProjectCanvasPyramid(projectId: string) {
  const rootDoc =
    (await readCanvasDoc(projectId, ROOT_GRAPH_ID)) ??
    createCanvasDocV1(emptyCanvasSnapshot(), {
      projectId,
      graphId: ROOT_GRAPH_ID,
      scopeKind: "system-root",
      title: "System",
    })
  const docs: CanvasDocV1[] = [rootDoc]
  const seenGraphIds = new Set([rootDoc.graphId])
  const pendingGraphIds = childGraphIds(rootDoc)

  while (pendingGraphIds.length > 0) {
    const graphId = pendingGraphIds.shift()
    if (!graphId || seenGraphIds.has(graphId)) continue
    seenGraphIds.add(graphId)

    const childDoc = await readCanvasDoc(projectId, graphId)
    if (!childDoc) continue

    docs.push(childDoc)
    pendingGraphIds.push(...childGraphIds(childDoc))
  }

  return buildCanvasPyramidFromDocs(projectId, docs)
}
