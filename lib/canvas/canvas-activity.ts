import type { CanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { validateCanvasSemantics } from "@/lib/canvas/semantic-validation"

export const CANVAS_ACTIVITY_PANEL_KEY = "canvasActivity" as const

export type CanvasActivityKind = "manual-save" | "architect-apply"

export interface CanvasActivityChangeSummary {
  addedNodeIds: string[]
  removedNodeIds: string[]
  changedNodeIds: string[]
  addedEdgeIds: string[]
  removedEdgeIds: string[]
  changedEdgeIds: string[]
}

export interface CanvasActivityEvent {
  kind: CanvasActivityKind
  at: string
  graphId: string
  actor: "user" | "architect"
  summary: string
  nodeCount: number
  edgeCount: number
  activeSemanticFindings: number
  blockingSemanticFindings: number
  changes: CanvasActivityChangeSummary
  applied?: {
    operations: number
    skippedOperations: number
    updateNodes: number
    updateEdges: number
    addNodes: number
    addEdges: number
    createLayers: number
    updateGraphs: number
  }
}

export interface CanvasActivityPanel {
  lastEvent: CanvasActivityEvent | null
  recentEvents: CanvasActivityEvent[]
}

function stableData(value: unknown) {
  return JSON.stringify(value ?? null)
}

function nodeLabelById(doc: CanvasDocV1, id: string) {
  const node = doc.nodes.find((item) => item.id === id)
  return node?.data.name || node?.data.label || id
}

function edgeLabelById(doc: CanvasDocV1, id: string) {
  const edge = doc.edges.find((item) => item.id === id)
  return edge?.data?.label || edge?.data?.name || id
}

function summarizeIds(ids: string[], labelForId: (id: string) => unknown) {
  return ids
    .slice(0, 6)
    .map((id) => {
      const label = labelForId(id)
      return typeof label === "string" && label.trim() && label !== id
        ? `${label.trim()} (${id})`
        : id
    })
}

export function summarizeCanvasActivityChanges(
  beforeDoc: CanvasDocV1 | null | undefined,
  afterDoc: CanvasDocV1
): CanvasActivityChangeSummary {
  const beforeNodes = new Map((beforeDoc?.nodes ?? []).map((node) => [node.id, node]))
  const afterNodes = new Map(afterDoc.nodes.map((node) => [node.id, node]))
  const beforeEdges = new Map((beforeDoc?.edges ?? []).map((edge) => [edge.id, edge]))
  const afterEdges = new Map(afterDoc.edges.map((edge) => [edge.id, edge]))

  const addedNodeIds = afterDoc.nodes
    .filter((node) => !beforeNodes.has(node.id))
    .map((node) => node.id)
  const removedNodeIds = [...beforeNodes.keys()].filter((id) => !afterNodes.has(id))
  const changedNodeIds = afterDoc.nodes
    .filter((node) => {
      const before = beforeNodes.get(node.id)
      return before ? stableData(before.data) !== stableData(node.data) : false
    })
    .map((node) => node.id)

  const addedEdgeIds = afterDoc.edges
    .filter((edge) => !beforeEdges.has(edge.id))
    .map((edge) => edge.id)
  const removedEdgeIds = [...beforeEdges.keys()].filter((id) => !afterEdges.has(id))
  const changedEdgeIds = afterDoc.edges
    .filter((edge) => {
      const before = beforeEdges.get(edge.id)
      if (!before) return false
      return (
        before.source !== edge.source ||
        before.target !== edge.target ||
        stableData(before.data) !== stableData(edge.data)
      )
    })
    .map((edge) => edge.id)

  return {
    addedNodeIds: summarizeIds(addedNodeIds, (id) => nodeLabelById(afterDoc, id)),
    removedNodeIds: summarizeIds(removedNodeIds, (id) =>
      beforeDoc ? nodeLabelById(beforeDoc, id) : id
    ),
    changedNodeIds: summarizeIds(changedNodeIds, (id) => nodeLabelById(afterDoc, id)),
    addedEdgeIds: summarizeIds(addedEdgeIds, (id) => edgeLabelById(afterDoc, id)),
    removedEdgeIds: summarizeIds(removedEdgeIds, (id) =>
      beforeDoc ? edgeLabelById(beforeDoc, id) : id
    ),
    changedEdgeIds: summarizeIds(changedEdgeIds, (id) => edgeLabelById(afterDoc, id)),
  }
}

function semanticCounts(doc: CanvasDocV1) {
  const findings = validateCanvasSemantics({ nodes: doc.nodes, edges: doc.edges })
  return {
    activeSemanticFindings: findings.length,
    blockingSemanticFindings: findings.filter((finding) => finding.blocking).length,
  }
}

export function createCanvasActivityEvent(input: {
  kind: CanvasActivityKind
  actor: CanvasActivityEvent["actor"]
  beforeDoc?: CanvasDocV1 | null
  afterDoc: CanvasDocV1
  applied?: CanvasActivityEvent["applied"]
  at?: string
}): CanvasActivityEvent {
  const counts = semanticCounts(input.afterDoc)
  const changes = summarizeCanvasActivityChanges(input.beforeDoc, input.afterDoc)
  const changedParts = [
    changes.addedNodeIds.length ? `${changes.addedNodeIds.length} node(s) added` : "",
    changes.changedNodeIds.length ? `${changes.changedNodeIds.length} node(s) updated` : "",
    changes.removedNodeIds.length ? `${changes.removedNodeIds.length} node(s) removed` : "",
    changes.addedEdgeIds.length ? `${changes.addedEdgeIds.length} edge(s) added` : "",
    changes.changedEdgeIds.length ? `${changes.changedEdgeIds.length} edge(s) updated` : "",
    changes.removedEdgeIds.length ? `${changes.removedEdgeIds.length} edge(s) removed` : "",
  ].filter(Boolean)

  return {
    kind: input.kind,
    at: input.at ?? new Date().toISOString(),
    graphId: input.afterDoc.graphId,
    actor: input.actor,
    summary: changedParts.length
      ? changedParts.join(", ")
      : "Canvas saved with no semantic node or edge data changes detected.",
    nodeCount: input.afterDoc.nodes.length,
    edgeCount: input.afterDoc.edges.length,
    activeSemanticFindings: counts.activeSemanticFindings,
    blockingSemanticFindings: counts.blockingSemanticFindings,
    changes,
    applied: input.applied,
  }
}

function normalizePanel(value: unknown): CanvasActivityPanel {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { lastEvent: null, recentEvents: [] }
  }
  const panel = value as { lastEvent?: unknown; recentEvents?: unknown }
  return {
    lastEvent:
      typeof panel.lastEvent === "object" &&
      panel.lastEvent !== null &&
      !Array.isArray(panel.lastEvent)
        ? (panel.lastEvent as CanvasActivityEvent)
        : null,
    recentEvents: Array.isArray(panel.recentEvents)
      ? panel.recentEvents
          .filter(
            (event): event is CanvasActivityEvent =>
              typeof event === "object" && event !== null && !Array.isArray(event)
          )
          .slice(-8)
      : [],
  }
}

export function canvasActivityFromDoc(doc: CanvasDocV1): CanvasActivityPanel {
  return normalizePanel(doc.panels[CANVAS_ACTIVITY_PANEL_KEY])
}

export function withCanvasActivity(
  doc: CanvasDocV1,
  event: CanvasActivityEvent
): CanvasDocV1 {
  const current = canvasActivityFromDoc(doc)
  const recentEvents = [...current.recentEvents, event].slice(-8)
  return {
    ...doc,
    panels: {
      ...doc.panels,
      [CANVAS_ACTIVITY_PANEL_KEY]: {
        lastEvent: event,
        recentEvents,
      } satisfies CanvasActivityPanel,
    },
  }
}
