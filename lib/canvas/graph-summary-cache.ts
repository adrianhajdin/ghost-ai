import type { CanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { edgeLabelTexts } from "@/lib/canvas/edge-labels"
import { edgeRelationshipTypeLabel, semanticNodeTypeLabel } from "@/types/canvas"

export const GRAPH_SUMMARY_CACHE_PANEL_KEY = "graphSummaryCache" as const
export const GRAPH_SUMMARY_CACHE_VERSION = "1.0.0" as const

export interface GraphSummaryCache {
  cacheVersion: typeof GRAPH_SUMMARY_CACHE_VERSION
  generatedBy: "mechanical"
  graphId: string
  contentHash: string
  nodeCount: number
  edgeCount: number
  childGraphCount: number
  summary: string
  keyNodes: string[]
  keyRelationships: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function nodeLabel(node: CanvasDocV1["nodes"][number]) {
  return text(node.data.name) ?? text(node.data.label) ?? node.id
}

function relationshipLabel(edge: CanvasDocV1["edges"][number]) {
  const labels = edgeLabelTexts(edge.data ?? {})
  return (
    labels[0] ??
    text(edge.data?.name) ??
    edgeRelationshipTypeLabel(edge.data?.relationshipType ?? edge.data?.semanticType)
  )
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isRecord(value)) return value

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, childValue]) => [key, stableValue(childValue)])
  )
}

function stableHash(value: unknown) {
  const serialized = JSON.stringify(stableValue(value))
  let hash = 5381
  for (let index = 0; index < serialized.length; index += 1) {
    hash = (hash * 33) ^ serialized.charCodeAt(index)
  }
  return `gsc_${(hash >>> 0).toString(36)}`
}

function childGraphIds(doc: CanvasDocV1) {
  return doc.nodes
    .map((node) => node.data.subcanvasRef?.graphId)
    .filter((graphId): graphId is string => typeof graphId === "string" && graphId.trim().length > 0)
}

export function graphSummaryCacheContentHash(doc: CanvasDocV1) {
  return stableHash({
    graphId: doc.graphId,
    title: doc.title,
    summary: doc.summary,
    nodes: doc.nodes.map((node) => ({
      id: node.id,
      label: nodeLabel(node),
      semanticType: node.data.semanticType,
      childGraphId: node.data.subcanvasRef?.graphId,
      childLayerSummary: node.data.childLayerSummary,
      lastLayerSummary: node.data.lastLayerSummary,
    })),
    edges: doc.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relationshipType: edge.data?.relationshipType ?? edge.data?.semanticType,
      label: relationshipLabel(edge),
    })),
  })
}

export function createGraphSummaryCache(doc: CanvasDocV1): GraphSummaryCache {
  const keyNodes = doc.nodes.map(nodeLabel).filter(Boolean).slice(0, 5)
  const keyRelationships = doc.edges.map(relationshipLabel).filter(Boolean).slice(0, 5)
  const typeNames = [...new Set(doc.nodes.map((node) => semanticNodeTypeLabel(node.data.semanticType)))].slice(0, 4)
  const countSummary = `${doc.nodes.length} node${doc.nodes.length === 1 ? "" : "s"}, ${doc.edges.length} edge${doc.edges.length === 1 ? "" : "s"}`
  const summaryParts = [countSummary]

  if (keyNodes.length > 0) {
    summaryParts.push(`key nodes: ${keyNodes.join(", ")}`)
  } else if (typeNames.length > 0) {
    summaryParts.push(`contains: ${typeNames.join(", ")}`)
  }

  if (keyRelationships.length > 0) {
    summaryParts.push(`relationships: ${keyRelationships.join(", ")}`)
  }

  return {
    cacheVersion: GRAPH_SUMMARY_CACHE_VERSION,
    generatedBy: "mechanical",
    graphId: doc.graphId,
    contentHash: graphSummaryCacheContentHash(doc),
    nodeCount: doc.nodes.length,
    edgeCount: doc.edges.length,
    childGraphCount: childGraphIds(doc).length,
    summary: doc.nodes.length === 0 && doc.edges.length === 0 ? "Empty child layer" : summaryParts.join(" · "),
    keyNodes,
    keyRelationships,
  }
}

export function normalizeGraphSummaryCache(value: unknown): GraphSummaryCache | null {
  if (!isRecord(value)) return null
  if (value.cacheVersion !== GRAPH_SUMMARY_CACHE_VERSION) return null
  if (value.generatedBy !== "mechanical") return null
  if (typeof value.graphId !== "string") return null
  if (typeof value.contentHash !== "string") return null
  if (typeof value.summary !== "string") return null
  if (typeof value.nodeCount !== "number") return null
  if (typeof value.edgeCount !== "number") return null
  if (typeof value.childGraphCount !== "number") return null

  return {
    cacheVersion: GRAPH_SUMMARY_CACHE_VERSION,
    generatedBy: "mechanical",
    graphId: value.graphId,
    contentHash: value.contentHash,
    nodeCount: value.nodeCount,
    edgeCount: value.edgeCount,
    childGraphCount: value.childGraphCount,
    summary: value.summary,
    keyNodes: Array.isArray(value.keyNodes)
      ? value.keyNodes.filter((item): item is string => typeof item === "string")
      : [],
    keyRelationships: Array.isArray(value.keyRelationships)
      ? value.keyRelationships.filter((item): item is string => typeof item === "string")
      : [],
  }
}

export function graphSummaryCacheFromDoc(doc: CanvasDocV1) {
  const cached = normalizeGraphSummaryCache(doc.panels[GRAPH_SUMMARY_CACHE_PANEL_KEY])
  if (cached?.graphId === doc.graphId && cached.contentHash === graphSummaryCacheContentHash(doc)) {
    return cached
  }
  return createGraphSummaryCache(doc)
}

export function refreshGraphSummaryCache(doc: CanvasDocV1): CanvasDocV1 {
  return {
    ...doc,
    panels: {
      ...doc.panels,
      [GRAPH_SUMMARY_CACHE_PANEL_KEY]: createGraphSummaryCache(doc),
    },
  }
}
