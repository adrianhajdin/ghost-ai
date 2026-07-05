import type { CanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { semanticNodeTypeLabel } from "@/types/canvas"
import type { CanvasDecompositionStatus, CanvasNode } from "@/types/canvas"

function nodeLabel(node: CanvasNode) {
  return node.data.name?.trim() || node.data.label?.trim() || node.id
}

function nodeTypeLabel(node: CanvasNode) {
  return semanticNodeTypeLabel(node.data.semanticType)
}

export function createMechanicalLayerSummary(doc: Pick<CanvasDocV1, "nodes" | "edges">) {
  if (doc.nodes.length === 0 && doc.edges.length === 0) return "Empty child layer"

  const keyNodes = doc.nodes
    .slice(0, 4)
    .map(nodeLabel)
    .filter(Boolean)
  const typeNames = [...new Set(doc.nodes.map(nodeTypeLabel))].slice(0, 4)
  const countSummary = `${doc.nodes.length} node${doc.nodes.length === 1 ? "" : "s"}, ${doc.edges.length} edge${doc.edges.length === 1 ? "" : "s"}`

  if (keyNodes.length > 0) {
    return `${countSummary} · key nodes: ${keyNodes.join(", ")}`
  }

  if (typeNames.length > 0) {
    return `${countSummary} · contains: ${typeNames.join(", ")}`
  }

  return countSummary
}

export function decompositionStatusForLayer(input: {
  doc: Pick<CanvasDocV1, "nodes" | "edges" | "summary">
  existingSummary?: unknown
  explicitStatus?: unknown
}): CanvasDecompositionStatus {
  if (
    input.explicitStatus === "planned" ||
    input.explicitStatus === "partial" ||
    input.explicitStatus === "complete" ||
    input.explicitStatus === "stale"
  ) {
    return input.explicitStatus
  }

  if (input.doc.nodes.length === 0 && input.doc.edges.length === 0) return "planned"
  if (
    (typeof input.existingSummary === "string" && input.existingSummary.trim()) ||
    (typeof input.doc.summary === "string" && input.doc.summary.trim())
  ) {
    return "complete"
  }
  return "partial"
}

export function childLayerMetadataPatch(input: {
  childDoc: CanvasDocV1
  existingParentNode?: CanvasNode | null
  authoredSummary?: string | null
  now?: string
}) {
  const now = input.now ?? new Date().toISOString()
  const existing = input.existingParentNode?.data
  const mechanicalSummary = createMechanicalLayerSummary(input.childDoc)
  const authoredSummary = input.authoredSummary?.trim()
  const docSummary = input.childDoc.summary?.trim()
  const existingChildSummary =
    typeof existing?.childLayerSummary === "string"
      ? existing.childLayerSummary.trim()
      : ""
  const reusableExistingChildSummary =
    existingChildSummary && existingChildSummary !== "Empty child layer"
      ? existingChildSummary
      : ""
  const childLayerPurpose =
    typeof existing?.childLayerPurpose === "string" && existing.childLayerPurpose.trim()
      ? existing.childLayerPurpose.trim()
      : authoredSummary || docSummary || input.childDoc.title

  return {
    hasChildLayer: true,
    childLayerPurpose,
    childLayerSummary:
      authoredSummary ||
      reusableExistingChildSummary ||
      docSummary ||
      mechanicalSummary,
    decompositionStatus: decompositionStatusForLayer({
      doc: input.childDoc,
      existingSummary: authoredSummary || reusableExistingChildSummary || docSummary,
      explicitStatus: existing?.decompositionStatus,
    }),
    lastLayerSummary: mechanicalSummary,
    childLayerUpdatedAt: now,
  } satisfies Partial<CanvasNode["data"]>
}

export function applyChildLayerSummaryToParentDoc(input: {
  parentDoc: CanvasDocV1
  childDoc: CanvasDocV1
  authoredSummary?: string | null
  now?: string
}) {
  if (!input.childDoc.parentNodeId) return input.parentDoc

  let changed = false
  const nodes = input.parentDoc.nodes.map((node) => {
    if (node.id !== input.childDoc.parentNodeId) return node

    changed = true
    return {
      ...node,
      data: {
        ...node.data,
        ...childLayerMetadataPatch({
          childDoc: input.childDoc,
          existingParentNode: node,
          authoredSummary: input.authoredSummary,
          now: input.now,
        }),
      },
    }
  })

  return changed ? { ...input.parentDoc, nodes } : input.parentDoc
}
