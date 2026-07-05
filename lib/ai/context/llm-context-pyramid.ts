import type {
  CanvasPyramid,
  CanvasPyramidEdge,
  CanvasPyramidGraph,
  CanvasPyramidNode,
  CanvasPyramidSemanticScanSummary,
} from "@/lib/canvas/canvas-pyramid"

interface LlmContextRecentMessageInput {
  role: "user" | "assistant"
  content: string
  graphId?: string
  createdAt?: string
}

export interface LlmContextPyramidInput {
  projectId: string
  projectName: string
  providerName: string
  currentGraphId: string
  selectedNodeIds: string[]
  recentMessages?: LlmContextRecentMessageInput[]
  canvasPyramid: CanvasPyramid
}

export interface LlmContextPyramid {
  contextVersion: "2.0.0"
  project: {
    id: string
    name: string
  }
  provider: {
    providerName: string
  }
  focus: {
    currentGraphId: string
    selectedNodeIds: string[]
    ancestorPath: Array<{
      graphId: string
      title: string
      parentGraphId: string | null
      parentNodeId: string | null
      summary: string
    }>
  }
  graphIndex: Array<{
    graphId: string
    title: string
    parentGraphId: string | null
    parentNodeId: string | null
    layer: number | null
    layerKind: string | null
    nodeCount: number
    edgeCount: number
    summary: string
  }>
  currentGraph: LlmContextGraphCard | null
  selectedNodes: LlmContextNodeCard[]
  connectedEdges: LlmContextEdgeCard[]
  relatedGraphSummaries: LlmContextRelatedGraphSummary[]
  semanticWarnings: LlmContextSemanticFinding[]
  recentConversation: Array<{
    role: "user" | "assistant"
    graphId?: string
    createdAt?: string
    content: string
  }>
  budget: {
    estimatedCharacters: number
    omittedGraphCount: number
    omittedNodeCount: number
    omittedEdgeCount: number
    omittedFindingCount: number
    omittedConversationCount: number
  }
}

export interface LlmContextGraphCard {
  graphId: string
  title: string
  parentGraphId: string | null
  parentNodeId: string | null
  layer: number | null
  layerKind: string | null
  nodeCount: number
  edgeCount: number
  summary: string
  childGraphCount: number
  nodes: LlmContextNodeCard[]
  edges: LlmContextEdgeCard[]
  semanticScan: Pick<CanvasPyramidSemanticScanSummary, "activeCount" | "blockingCount" | "groupedCounts">
}

export interface LlmContextNodeCard {
  graphId: string
  id: string
  label: string
  semanticType?: unknown
  metadataSummary: Record<string, unknown>
  childLayer?: unknown
}

export interface LlmContextEdgeCard {
  graphId: string
  id: string
  source: string
  target: string
  relationshipType?: unknown
  label?: unknown
  metadataSummary: Record<string, unknown>
}

export interface LlmContextRelatedGraphSummary {
  relation: "child" | "sibling" | "referenced"
  graphId: string
  title: string
  parentGraphId: string | null
  parentNodeId: string | null
  nodeCount: number
  edgeCount: number
  summary: string
}

export interface LlmContextSemanticFinding {
  graphId: string
  id: string
  category: string
  severity: string
  advisory: boolean
  blocking: boolean
  targetKind: string
  targetId?: string
  message: string
}

const MAX_GRAPH_INDEX = 30
const MAX_CURRENT_GRAPH_NODES = 32
const MAX_CURRENT_GRAPH_EDGES = 48
const MAX_SELECTED_NODES = 20
const MAX_CONNECTED_EDGES = 36
const MAX_RELATED_GRAPHS = 24
const MAX_FINDINGS = 32
const MAX_RECENT_MESSAGES = 20
const MAX_MESSAGE_CHARS = 1200

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function nodeLabel(node: CanvasPyramidNode) {
  return text(node.metadataSummary.label) ?? text(node.data.name) ?? text(node.data.label) ?? node.id
}

function edgeLabel(edge: CanvasPyramidEdge) {
  return text(edge.metadataSummary.label) ?? text(edge.data.name) ?? text(edge.data.label)
}

function truncate(value: string, max = MAX_MESSAGE_CHARS) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

function graphById(pyramid: CanvasPyramid) {
  return new Map(pyramid.graphs.map((graph) => [graph.graphId, graph]))
}

function nodeCard(graph: CanvasPyramidGraph, node: CanvasPyramidNode): LlmContextNodeCard {
  return {
    graphId: graph.graphId,
    id: node.id,
    label: nodeLabel(node),
    semanticType: node.data.semanticType,
    metadataSummary: node.metadataSummary,
    childLayer: node.metadataSummary.childLayer,
  }
}

function edgeCard(graph: CanvasPyramidGraph, edge: CanvasPyramidEdge): LlmContextEdgeCard {
  return {
    graphId: graph.graphId,
    id: edge.id,
    source: edge.source,
    target: edge.target,
    relationshipType: edge.data.relationshipType ?? edge.data.semanticType,
    label: edgeLabel(edge),
    metadataSummary: edge.metadataSummary,
  }
}

function graphCard(graph: CanvasPyramidGraph): LlmContextGraphCard {
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
    childGraphCount: graph.graphSummaryCache.childGraphCount,
    nodes: graph.nodes.slice(0, MAX_CURRENT_GRAPH_NODES).map((node) => nodeCard(graph, node)),
    edges: graph.edges.slice(0, MAX_CURRENT_GRAPH_EDGES).map((edge) => edgeCard(graph, edge)),
    semanticScan: {
      activeCount: graph.semanticScan.activeCount,
      blockingCount: graph.semanticScan.blockingCount,
      groupedCounts: graph.semanticScan.groupedCounts,
    },
  }
}

function ancestorPath(graph: CanvasPyramidGraph | undefined, graphs: Map<string, CanvasPyramidGraph>) {
  const path: LlmContextPyramid["focus"]["ancestorPath"] = []
  const seen = new Set<string>()
  let current = graph

  while (current && !seen.has(current.graphId)) {
    seen.add(current.graphId)
    path.unshift({
      graphId: current.graphId,
      title: current.title,
      parentGraphId: current.parentGraphId,
      parentNodeId: current.parentNodeId,
      summary: current.graphSummaryCache.summary,
    })
    current = current.parentGraphId ? graphs.get(current.parentGraphId) : undefined
  }

  return path
}

function selectedNodeCards(input: {
  selectedNodeIds: string[]
  currentGraph: CanvasPyramidGraph | undefined
}) {
  if (!input.currentGraph) return []
  const selectedIds = new Set(input.selectedNodeIds)
  return input.currentGraph.nodes
    .filter((node) => selectedIds.has(node.id))
    .slice(0, MAX_SELECTED_NODES)
    .map((node) => nodeCard(input.currentGraph!, node))
}

function connectedEdgeCards(input: {
  selectedNodeIds: string[]
  currentGraph: CanvasPyramidGraph | undefined
}) {
  if (!input.currentGraph || input.selectedNodeIds.length === 0) return []
  const selectedIds = new Set(input.selectedNodeIds)
  return input.currentGraph.edges
    .filter((edge) => selectedIds.has(edge.source) || selectedIds.has(edge.target))
    .slice(0, MAX_CONNECTED_EDGES)
    .map((edge) => edgeCard(input.currentGraph!, edge))
}

function relatedGraphs(input: {
  pyramid: CanvasPyramid
  currentGraph: CanvasPyramidGraph | undefined
  selectedNodes: LlmContextNodeCard[]
}) {
  const currentGraph = input.currentGraph
  if (!currentGraph) return []

  const referencedGraphIds = new Set<string>()
  for (const node of currentGraph.nodes) {
    const directGraphId = text(node.data.referencedGraphId)
    const referenceSummary = node.metadataSummary.reference
    const summaryGraphId =
      typeof referenceSummary === "object" && referenceSummary !== null && !Array.isArray(referenceSummary)
        ? text((referenceSummary as { referencedGraphId?: unknown }).referencedGraphId)
        : undefined
    const graphId = directGraphId ?? summaryGraphId
    if (graphId && graphId !== currentGraph.graphId) referencedGraphIds.add(graphId)
  }

  const selectedChildGraphIds = input.selectedNodes
    .map((node) => {
      const childLayer = node.childLayer
      if (typeof childLayer !== "object" || childLayer === null || Array.isArray(childLayer)) return null
      const graphId = (childLayer as { graphId?: unknown }).graphId
      return typeof graphId === "string" ? graphId : null
    })
    .filter((graphId): graphId is string => Boolean(graphId))
  const currentSiblingParent = currentGraph.parentGraphId
  const related: LlmContextRelatedGraphSummary[] = []

  for (const graph of input.pyramid.graphs) {
    let relation: LlmContextRelatedGraphSummary["relation"] | null = null
    if (referencedGraphIds.has(graph.graphId)) {
      relation = "referenced"
    } else if (graph.parentGraphId === currentGraph.graphId || selectedChildGraphIds.includes(graph.graphId)) {
      relation = "child"
    } else if (currentSiblingParent && graph.parentGraphId === currentSiblingParent && graph.graphId !== currentGraph.graphId) {
      relation = "sibling"
    }

    if (!relation) continue
    related.push({
      relation,
      graphId: graph.graphId,
      title: graph.title,
      parentGraphId: graph.parentGraphId,
      parentNodeId: graph.parentNodeId,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      summary: graph.graphSummaryCache.summary,
    })
  }

  return related.slice(0, MAX_RELATED_GRAPHS)
}

function semanticFindings(input: {
  pyramid: CanvasPyramid
  currentGraphId: string
  selectedNodeIds: string[]
}) {
  const selected = new Set(input.selectedNodeIds)
  return input.pyramid.graphs
    .flatMap((graph) =>
      graph.semanticScan.findings.map((finding) => ({
        graphId: graph.graphId,
        ...finding,
      }))
    )
    .sort((left, right) => {
      const leftCurrent = left.graphId === input.currentGraphId ? 0 : 1
      const rightCurrent = right.graphId === input.currentGraphId ? 0 : 1
      if (leftCurrent !== rightCurrent) return leftCurrent - rightCurrent
      const leftSelected = left.targetId && selected.has(left.targetId) ? 0 : 1
      const rightSelected = right.targetId && selected.has(right.targetId) ? 0 : 1
      if (leftSelected !== rightSelected) return leftSelected - rightSelected
      if (left.blocking !== right.blocking) return left.blocking ? -1 : 1
      return left.id.localeCompare(right.id)
    })
    .slice(0, MAX_FINDINGS)
}

function recentConversation(messages: LlmContextRecentMessageInput[] | undefined) {
  return (messages ?? []).slice(-MAX_RECENT_MESSAGES).map((message) => ({
    role: message.role,
    graphId: message.graphId,
    createdAt: message.createdAt,
    content: truncate(message.content),
  }))
}

function withBudget(context: Omit<LlmContextPyramid, "budget">, input: LlmContextPyramidInput): LlmContextPyramid {
  const omittedGraphCount = Math.max(0, input.canvasPyramid.graphIndex.length - MAX_GRAPH_INDEX)
  const currentGraph = input.canvasPyramid.graphs.find((graph) => graph.graphId === input.currentGraphId)
  const omittedNodeCount = Math.max(0, (currentGraph?.nodes.length ?? 0) - MAX_CURRENT_GRAPH_NODES)
  const omittedEdgeCount = Math.max(0, (currentGraph?.edges.length ?? 0) - MAX_CURRENT_GRAPH_EDGES)
  const allFindingCount = input.canvasPyramid.graphs.reduce(
    (count, graph) => count + graph.semanticScan.findings.length,
    0
  )
  const omittedFindingCount = Math.max(0, allFindingCount - MAX_FINDINGS)
  const omittedConversationCount = Math.max(0, (input.recentMessages?.length ?? 0) - MAX_RECENT_MESSAGES)

  return {
    ...context,
    budget: {
      estimatedCharacters: JSON.stringify(context).length,
      omittedGraphCount,
      omittedNodeCount,
      omittedEdgeCount,
      omittedFindingCount,
      omittedConversationCount,
    },
  }
}

export function buildLlmContextPyramid(input: LlmContextPyramidInput): LlmContextPyramid {
  const graphs = graphById(input.canvasPyramid)
  const currentGraph = graphs.get(input.currentGraphId)
  const selectedNodes = selectedNodeCards({
    selectedNodeIds: input.selectedNodeIds,
    currentGraph,
  })
  const context = {
    contextVersion: "2.0.0" as const,
    project: {
      id: input.projectId,
      name: input.projectName,
    },
    provider: {
      providerName: input.providerName,
    },
    focus: {
      currentGraphId: input.currentGraphId,
      selectedNodeIds: input.selectedNodeIds,
      ancestorPath: ancestorPath(currentGraph, graphs),
    },
    graphIndex: input.canvasPyramid.graphIndex.slice(0, MAX_GRAPH_INDEX),
    currentGraph: currentGraph ? graphCard(currentGraph) : null,
    selectedNodes,
    connectedEdges: connectedEdgeCards({
      selectedNodeIds: input.selectedNodeIds,
      currentGraph,
    }),
    relatedGraphSummaries: relatedGraphs({
      pyramid: input.canvasPyramid,
      currentGraph,
      selectedNodes,
    }),
    semanticWarnings: semanticFindings({
      pyramid: input.canvasPyramid,
      currentGraphId: input.currentGraphId,
      selectedNodeIds: input.selectedNodeIds,
    }),
    recentConversation: recentConversation(input.recentMessages),
  }

  return withBudget(context, input)
}
