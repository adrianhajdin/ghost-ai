import type { CanvasEdge, CanvasNode } from "@/types/canvas"
import { edgeRelationshipTypeLabel, semanticNodeTypeLabel } from "@/types/canvas"
import { edgeLabelTexts } from "@/lib/canvas/edge-labels"

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function list(value: unknown, limit = 5) {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, limit)
    : []
}

export function summarizeNodeMetadataForLlm(node: CanvasNode) {
  return {
    type: semanticNodeTypeLabel(node.data.semanticType),
    label: text(node.data.name) ?? text(node.data.label) ?? node.id,
    responsibility:
      list(node.data.responsibilities, 1)[0] ?? text(node.data.description),
    owner: text(node.data.owner),
    boundary: text(node.data.boundary),
    trustZone: text(node.data.trustZone),
    exposure: text(node.data.exposure),
    dataSensitivity: text(node.data.dataSensitivity),
    authExpectation: text(node.data.authExpectation),
    layerRole: text(node.data.layerRole),
    status: text(node.data.status),
    maturity: text(node.data.maturity),
    interfacesExposed: list(node.data.interfacesExposed),
    interfacesConsumed: list(node.data.interfacesConsumed),
    dataOwned: list(node.data.dataOwned),
    dataRead: list(node.data.dataRead),
    eventsEmitted: list(node.data.eventsEmitted),
    eventsConsumed: list(node.data.eventsConsumed),
    securityNotes: text(node.data.securityNotes),
    trustNotes: text(node.data.trustNotes),
    safetyNotes: text(node.data.safetyNotes),
    privacyClass: text(node.data.privacyClass),
    runtimeKind: text(node.data.runtimeKind),
    environment: text(node.data.environment),
    region: text(node.data.region),
    operationalNotes: text(node.data.operationalNotes),
    scalingNotes: text(node.data.scalingNotes),
    observabilityNotes: text(node.data.observabilityNotes),
    signalTypes: list(node.data.signalTypes),
    retentionNotes: text(node.data.retentionNotes),
    incidentNotes: text(node.data.incidentNotes),
    failureModes: list(node.data.failureModes, 3),
    ai: node.data.semanticType === "ai-component"
      ? {
          role: text(node.data.aiRole),
          modelProvider: text(node.data.modelProvider),
          modelClass: text(node.data.modelClass),
          toolAccess: list(node.data.toolAccess),
          retrievalNotes: text(node.data.retrievalNotes),
          costNotes: text(node.data.costNotes),
        }
      : undefined,
    reference: node.data.semanticType === "reference-proxy" ||
      text(node.data.referencedGraphId) ||
      text(node.data.referencedNodeId) ||
      text(node.data.referencedEdgeId)
      ? {
          implementationTarget: false,
          referenceKind: text(node.data.referenceKind),
          referencedGraphId: text(node.data.referencedGraphId),
          referencedNodeId: text(node.data.referencedNodeId),
          referencedEdgeId: text(node.data.referencedEdgeId),
          referencedLabel: text(node.data.referencedLabel),
          referenceRole: text(node.data.referenceRole),
          proxyDirection: text(node.data.proxyDirection),
          notes: text(node.data.referenceNotes),
        }
      : undefined,
    promptPackNotes: text(node.data.promptPackNotes),
    openQuestions: list(node.data.openQuestions, 3),
    childLayer: node.data.hasChildLayer || node.data.subcanvasRef?.graphId
      ? {
          graphId: node.data.subcanvasRef?.graphId,
          purpose: text(node.data.childLayerPurpose),
          summary: text(node.data.childLayerSummary),
          status: text(node.data.decompositionStatus),
          lastSummary: text(node.data.lastLayerSummary),
          updatedAt: text(node.data.childLayerUpdatedAt),
        }
      : undefined,
  }
}

export function summarizeEdgeMetadataForLlm(edge: CanvasEdge) {
  const data = edge.data ?? {}

  return {
    relationshipType: edgeRelationshipTypeLabel(data.relationshipType ?? data.semanticType),
    label: edgeLabelTexts(data).join(" / ") || text(data.name),
    source: edge.source,
    target: edge.target,
    mechanism: text(data.mechanism),
    protocol: text(data.protocol),
    syncMode: text(data.syncMode),
    criticality: text(data.criticality),
    directionality: text(data.directionality),
    reliability: text(data.reliability),
    retryPolicy: text(data.retryPolicy),
    idempotencyNotes: text(data.idempotencyNotes),
    consistency: text(data.consistency),
    rateLimitNotes: text(data.rateLimitNotes),
    timeoutNotes: text(data.timeoutNotes),
    fallbackNotes: text(data.fallbackNotes),
    ownershipNotes: text(data.ownershipNotes),
    dataSubject: text(data.dataSubject),
    eventSubject: text(data.eventSubject),
    securityNotes: text(data.securityNotes),
    trustNotes: text(data.trustNotes),
    status: text(data.status),
  }
}
