import { createCanvasDocV1, type CanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { emptyCanvasSnapshot, sanitizeCanvasSnapshot } from "@/lib/canvas/canvas-state"
import {
  canvasGraphExists,
  readCanvasDoc,
  writeCanvasDoc,
} from "@/lib/canvas/canvas-persistence"
import {
  appendGraphIdSuffix,
  createLayerGraphIdBase,
  graphIdFromSearchParam,
  isValidGraphId,
} from "@/lib/canvas/graph-ids"
import { baseNodeData, semanticDefaultsForType } from "@/lib/canvas/semantic-defaults"
import {
  applyChildLayerSummaryToParentDoc,
  childLayerMetadataPatch,
} from "@/lib/canvas/child-layer-summary"
import { createEdgeLabelItems, mirrorEdgeLabelData } from "@/lib/canvas/edge-labels"
import {
  NODE_COLORS,
  SHAPE_DEFAULTS,
  isSemanticEdgeType,
  normalizeEdgeRelationshipType,
  normalizeSemanticNodeType,
  type CanvasEdge,
  type CanvasNode,
  type SemanticEdgeType,
  type SemanticNodeType,
} from "@/types/canvas"
import {
  extractLlmCanvasImprovementProposal,
  sanitizeLlmCanvasPatchRecord,
  type LlmCanvasImprovementProposal,
  type LlmCanvasPatchOperation,
} from "@/lib/canvas/llm-canvas-patch-contract"

type UpdateNodeOperation = Extract<LlmCanvasPatchOperation, { op: "update-node" }>
type AddNodeOperation = Extract<LlmCanvasPatchOperation, { op: "add-node" }>
type AddEdgeOperation = Extract<LlmCanvasPatchOperation, { op: "add-edge" }>
type CreateLayerOperation = Extract<LlmCanvasPatchOperation, { op: "create-layer" }>
type UpdateGraphOperation = Extract<LlmCanvasPatchOperation, { op: "update-graph" }>

export interface LlmCanvasPatchApplyIssue {
  operationIndex: number
  severity: "warning" | "error"
  message: string
}

export interface LlmCanvasPatchApplyResult {
  applied: {
    operations: number
    updateNodes: number
    addNodes: number
    addEdges: number
    createLayers: number
    updateGraphs: number
    skippedOperations: number
  }
  dirtyGraphIds: string[]
  docs: CanvasDocV1[]
  issues: LlmCanvasPatchApplyIssue[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function slugifyId(value: string, fallback: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
  return slug || fallback
}

function resolveCollision(baseId: string, usedIds: Set<string>) {
  let nextId = baseId
  let index = 2
  while (usedIds.has(nextId)) {
    nextId = `${baseId}-${index}`.slice(0, 120)
    index += 1
  }
  usedIds.add(nextId)
  return nextId
}

function writeOptionsForDoc(doc: CanvasDocV1) {
  return {
    graphId: doc.graphId,
    parentGraphId: doc.parentGraphId,
    parentNodeId: doc.parentNodeId,
    scopeKind: doc.scopeKind,
    title: doc.title,
    layer: doc.layer,
    layerKind: doc.layerKind,
    summary: doc.summary,
  }
}

function nodeShapeAndColor(semanticType: SemanticNodeType) {
  if (semanticType === "database") return { shape: "cylinder" as const, colorIndex: 7 }
  if (semanticType === "cache-store" || semanticType === "object-store") {
    return { shape: "cylinder" as const, colorIndex: 7 }
  }
  if (semanticType === "worker") return { shape: "hexagon" as const, colorIndex: 6 }
  if (semanticType === "identity-auth" || semanticType === "auth-module") {
    return { shape: "pill" as const, colorIndex: 2 }
  }
  if (semanticType === "client-surface" || semanticType === "frontend") {
    return { shape: "rectangle" as const, colorIndex: 5 }
  }
  if (semanticType === "actor") return { shape: "circle" as const, colorIndex: 2 }
  if (semanticType === "event-channel") return { shape: "diamond" as const, colorIndex: 3 }
  if (semanticType === "api" || semanticType === "endpoint") {
    return { shape: "circle" as const, colorIndex: 1 }
  }
  if (semanticType === "external-system") {
    return { shape: "hexagon" as const, colorIndex: 3 }
  }
  return { shape: "rectangle" as const, colorIndex: 0 }
}

function nodeTypeMetadata(
  semanticTypeText: string | undefined,
  typeText: string | undefined
) {
  const architectureType = typeText ?? semanticTypeText
  const normalized = normalizeSemanticNodeType(semanticTypeText)
  if (!semanticTypeText || normalized) {
    return {
      semanticType: (normalized ?? "unclassified") as SemanticNodeType,
      customTypeData: architectureType ? { architectureType } : {},
    }
  }

  return {
    semanticType: "generic-component" as SemanticNodeType,
    customTypeData: {
      llmSemanticType: semanticTypeText,
      architectureType: architectureType ?? semanticTypeText,
      originalSemanticType: semanticTypeText,
    },
  }
}

function edgeTypeMetadata(
  semanticTypeText: string | undefined,
  typeText: string | undefined
) {
  const architectureType = typeText ?? semanticTypeText
  const relationshipType = normalizeEdgeRelationshipType(semanticTypeText)
  if (!semanticTypeText || isSemanticEdgeType(semanticTypeText)) {
    return {
      semanticType: (semanticTypeText ?? "unclassified") as SemanticEdgeType,
      relationshipType: relationshipType ?? undefined,
      customTypeData: architectureType ? { architectureType } : {},
    }
  }

  return {
    semanticType: (relationshipType ?? "unclassified") as SemanticEdgeType,
    relationshipType: relationshipType ?? undefined,
    customTypeData: {
      llmSemanticType: semanticTypeText,
      architectureType: architectureType ?? semanticTypeText,
      originalSemanticType: semanticTypeText,
    },
  }
}

function patchText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function nodeFromPatch(
  operationNode: AddNodeOperation["node"],
  id: string,
  index: number,
  existingNodes: CanvasNode[]
): CanvasNode {
  const metadata = sanitizeLlmCanvasPatchRecord(operationNode.metadata)
  const semanticTypeText =
    patchText(operationNode.semanticType) ??
    patchText(operationNode.type) ??
    patchText(metadata.semanticType)
  const typeText = patchText(operationNode.type) ?? patchText(metadata.type)
  const { semanticType, customTypeData } = nodeTypeMetadata(
    semanticTypeText,
    typeText
  )
  const { shape, colorIndex } = nodeShapeAndColor(semanticType)
  const color = NODE_COLORS[colorIndex]
  const size = SHAPE_DEFAULTS[shape]
  const maxY =
    existingNodes.length === 0
      ? 0
      : Math.max(...existingNodes.map((node) => node.position.y + (node.height ?? 80)))
  const position = operationNode.position ?? {
    x: 80 + (index % 4) * 240,
    y: 80 + Math.floor(index / 4) * 170 + (existingNodes.length ? maxY + 120 : 0),
  }

  return {
    id,
    type: "canvasNode",
    position,
    width: size.width,
    height: size.height,
    data: {
      ...baseNodeData(operationNode.label),
      ...semanticDefaultsForType(semanticType),
      ...metadata,
      ...customTypeData,
      semanticType,
      label: operationNode.label,
      name: operationNode.name ?? operationNode.label,
      description: operationNode.description ?? patchText(metadata.description) ?? "",
      status: "draft",
      color: color.fill,
      textColor: color.text,
      shape,
    },
  }
}

function edgeFromPatch(
  operationEdge: AddEdgeOperation["edge"],
  id: string,
  source: string,
  target: string
): CanvasEdge {
  const metadata = sanitizeLlmCanvasPatchRecord(operationEdge.metadata)
  const semanticTypeText =
    patchText(operationEdge.relationshipType) ??
    patchText(operationEdge.semanticType) ??
    patchText(operationEdge.type) ??
    patchText(metadata.relationshipType) ??
    patchText(metadata.semanticType)
  const typeText = patchText(operationEdge.type) ?? patchText(metadata.type)
  const { semanticType, relationshipType, customTypeData } = edgeTypeMetadata(
    semanticTypeText,
    typeText
  )
  const labels =
    operationEdge.labels.length > 0
      ? operationEdge.labels
      : operationEdge.label
        ? [operationEdge.label]
        : []
  const labelItems = createEdgeLabelItems(labels, [], `${id}-label`)

  return {
    id,
    type: "canvasEdge",
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
    data: {
      ...metadata,
      ...customTypeData,
      semanticType,
      relationshipType,
      name: patchText(metadata.name) ?? operationEdge.label ?? "",
      status: "draft",
      tags: Array.isArray(metadata.tags) ? metadata.tags : [],
      sourceRefs: Array.isArray(metadata.sourceRefs) ? metadata.sourceRefs : [],
      assumptions: Array.isArray(metadata.assumptions) ? metadata.assumptions : [],
      decisionRefs: Array.isArray(metadata.decisionRefs) ? metadata.decisionRefs : [],
      owner: typeof metadata.owner === "string" ? metadata.owner : null,
      ...mirrorEdgeLabelData(labelItems),
    },
    markerEnd: {
      type: "arrowclosed",
      color: "rgba(255,255,255,0.4)",
      width: 16,
      height: 16,
    },
  }
}

function sanitizeDoc(doc: CanvasDocV1): CanvasDocV1 {
  const canvas = sanitizeCanvasSnapshot({ nodes: doc.nodes, edges: doc.edges })
  return {
    ...doc,
    nodes: canvas.nodes,
    edges: canvas.edges,
  }
}

async function getDoc(
  projectId: string,
  graphId: string,
  docsByGraphId: Map<string, CanvasDocV1>
) {
  const safeGraphId = graphIdFromSearchParam(graphId)
  const cached = docsByGraphId.get(safeGraphId)
  if (cached) return cached
  const doc = await readCanvasDoc(projectId, safeGraphId)
  if (!doc) return null
  docsByGraphId.set(safeGraphId, doc)
  return doc
}

async function uniqueGraphId(
  projectId: string,
  parentGraphId: string,
  parentNode: CanvasNode
) {
  const baseGraphId = createLayerGraphIdBase(parentGraphId, parentNode)
  for (let index = 0; index < 20; index += 1) {
    const candidate =
      index === 0 ? baseGraphId : appendGraphIdSuffix(baseGraphId, String(index + 1))
    const exists = await canvasGraphExists(projectId, candidate)
    if (!exists) return candidate
  }
  return appendGraphIdSuffix(baseGraphId, Math.random().toString(36).slice(2, 8))
}

function issue(
  issues: LlmCanvasPatchApplyIssue[],
  operationIndex: number,
  message: string,
  severity: "warning" | "error" = "warning"
) {
  issues.push({ operationIndex, severity, message })
}

function getExistingSubcanvasGraphId(parentNode: CanvasNode) {
  const graphId = parentNode.data.subcanvasRef?.graphId
  if (typeof graphId !== "string") return null
  const trimmed = graphId.trim()
  return isValidGraphId(trimmed) ? trimmed : null
}

function addNodeToDoc(
  doc: CanvasDocV1,
  operation: AddNodeOperation,
  index: number,
  tempIdMap: Map<string, string>
) {
  const usedNodeIds = new Set(doc.nodes.map((node) => node.id))
  const requestedId =
    operation.node.id ??
    operation.tempId ??
    slugifyId(operation.node.label, `node-${Date.now()}`)
  const id = resolveCollision(slugifyId(requestedId, "node"), usedNodeIds)
  if (operation.tempId) tempIdMap.set(operation.tempId, id)
  if (operation.node.id) tempIdMap.set(operation.node.id, id)
  const node = nodeFromPatch(operation.node, id, index, doc.nodes)
  return sanitizeDoc({ ...doc, nodes: [...doc.nodes, node] })
}

function addEdgeToDoc(
  doc: CanvasDocV1,
  operation: AddEdgeOperation,
  tempIdMap: Map<string, string>
) {
  const usedEdgeIds = new Set(doc.edges.map((edge) => edge.id))
  const source = tempIdMap.get(operation.edge.source) ?? operation.edge.source
  const target = tempIdMap.get(operation.edge.target) ?? operation.edge.target
  const nodeIds = new Set(doc.nodes.map((node) => node.id))
  if (!nodeIds.has(source) || !nodeIds.has(target)) {
    return null
  }
  const requestedId =
    operation.edge.id ??
    operation.tempId ??
    slugifyId(`edge-${source}-${target}`, `edge-${Date.now()}`)
  const id = resolveCollision(slugifyId(requestedId, "edge"), usedEdgeIds)
  if (operation.tempId) tempIdMap.set(operation.tempId, id)
  const edge = edgeFromPatch(operation.edge, id, source, target)
  return sanitizeDoc({ ...doc, edges: [...doc.edges, edge] })
}

function applyNodePatchData(node: CanvasNode, patch: Record<string, unknown>) {
  const sanitizedPatch = sanitizeLlmCanvasPatchRecord(patch)
  const semanticTypeText = patchText(sanitizedPatch.semanticType)
  const typeText = patchText(sanitizedPatch.type)
  const nextData: Record<string, unknown> = {
    ...node.data,
    ...sanitizedPatch,
  }

  if (semanticTypeText || typeText) {
    const { semanticType, customTypeData } = nodeTypeMetadata(
      semanticTypeText ?? node.data.semanticType,
      typeText
    )
    nextData.semanticType = semanticType
    Object.assign(nextData, customTypeData)
  }

  delete nextData.type
  return {
    ...node,
    data: nextData as CanvasNode["data"],
  }
}

async function createLayer(
  projectId: string,
  parentDoc: CanvasDocV1,
  operation: CreateLayerOperation,
  docsByGraphId: Map<string, CanvasDocV1>,
  dirtyGraphIds: Set<string>,
  operationIndex: number,
  issues: LlmCanvasPatchApplyIssue[]
) {
  const parentNode = parentDoc.nodes.find((node) => node.id === operation.parentNodeId)
  if (!parentNode) {
    issue(issues, operationIndex, "Canvas patch references a missing node.")
    return false
  }

  const existingGraphId = getExistingSubcanvasGraphId(parentNode)
  const graphId =
    existingGraphId ?? (await uniqueGraphId(projectId, parentDoc.graphId, parentNode))
  const now = new Date().toISOString()
  const layer =
    typeof parentDoc.layer === "number"
      ? parentDoc.layer + 1
      : parentDoc.graphId === "graph_root"
        ? 1
        : 1
  const existingChildDoc = existingGraphId
    ? await getDoc(projectId, existingGraphId, docsByGraphId)
    : null
  const childDoc = existingChildDoc
    ? sanitizeDoc({
        ...existingChildDoc,
        parentGraphId: existingChildDoc.parentGraphId ?? parentDoc.graphId,
        parentNodeId: existingChildDoc.parentNodeId ?? parentNode.id,
        scopeKind:
          existingChildDoc.scopeKind === "system-root"
            ? "architecture-layer"
            : existingChildDoc.scopeKind,
        layer: existingChildDoc.layer ?? layer,
        layerKind:
          existingChildDoc.layerKind ??
          operation.graph.layerKind ??
          "architecture-layer",
        summary: existingChildDoc.summary ?? operation.graph.summary ?? null,
      })
    : createCanvasDocV1(emptyCanvasSnapshot(), {
        projectId,
        graphId,
        parentGraphId: parentDoc.graphId,
        parentNodeId: parentNode.id,
        scopeKind: "architecture-layer",
        title: operation.graph.title,
        layer,
        layerKind: operation.graph.layerKind ?? "architecture-layer",
        summary: operation.graph.summary ?? null,
      })
  const tempIdMap = new Map<string, string>()
  let nextChildDoc = childDoc
  operation.graph.nodes.forEach((node, index) => {
    nextChildDoc = addNodeToDoc(
      nextChildDoc,
      { op: "add-node", graphId, tempId: patchText(node.tempId) ?? node.id, node },
      index,
      tempIdMap
    )
  })
  operation.graph.edges.forEach((edgeOperation, index) => {
    const nextDoc = addEdgeToDoc(
      nextChildDoc,
      { op: "add-edge", graphId, tempId: edgeOperation.id, edge: edgeOperation },
      tempIdMap
    )
    if (nextDoc) nextChildDoc = nextDoc
    else issue(issues, operationIndex, `Child layer edge ${index + 1} references a missing node.`)
  })

  const subcanvasRef = existingGraphId
    ? {
        ...parentNode.data.subcanvasRef,
        graphId,
        scopeKind: parentNode.data.subcanvasRef?.scopeKind ?? ("architecture-layer" as const),
        title: parentNode.data.subcanvasRef?.title ?? operation.graph.title,
        parentGraphId: parentNode.data.subcanvasRef?.parentGraphId ?? parentDoc.graphId,
        parentNodeId: parentNode.data.subcanvasRef?.parentNodeId ?? parentNode.id,
        layer: parentNode.data.subcanvasRef?.layer ?? layer,
        layerKind:
          parentNode.data.subcanvasRef?.layerKind ??
          operation.graph.layerKind ??
          "architecture-layer",
        summary: parentNode.data.subcanvasRef?.summary ?? operation.graph.summary,
        updatedAt: now,
        llmLayerPurpose:
          parentNode.data.subcanvasRef?.llmLayerPurpose ?? operation.graph.summary,
      }
    : {
        graphId,
        scopeKind: "architecture-layer" as const,
        title: operation.graph.title,
        parentGraphId: parentDoc.graphId,
        parentNodeId: parentNode.id,
        layer,
        layerKind: operation.graph.layerKind ?? "architecture-layer",
        summary: operation.graph.summary,
        createdAt: now,
        updatedAt: now,
        llmLayerPurpose: operation.graph.summary,
      }
  const layerMetadata = childLayerMetadataPatch({
    childDoc: nextChildDoc,
    existingParentNode: parentNode,
    authoredSummary: operation.graph.summary ?? null,
    now,
  })
  const nextParentDoc = sanitizeDoc({
    ...parentDoc,
    nodes: parentDoc.nodes.map((node) =>
      node.id === parentNode.id
        ? { ...node, data: { ...node.data, subcanvasRef, ...layerMetadata } }
        : node
    ),
  })

  docsByGraphId.set(parentDoc.graphId, nextParentDoc)
  dirtyGraphIds.add(parentDoc.graphId)

  docsByGraphId.set(graphId, nextChildDoc)
  dirtyGraphIds.add(graphId)
  return true
}

async function refreshDirtyChildLayerSummaries(input: {
  projectId: string
  docsByGraphId: Map<string, CanvasDocV1>
  dirtyGraphIds: Set<string>
}) {
  const queue = [...input.dirtyGraphIds]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const graphId = queue.shift()
    if (!graphId || visited.has(graphId)) continue
    visited.add(graphId)

    const childDoc = input.docsByGraphId.get(graphId)
    if (!childDoc?.parentGraphId || !childDoc.parentNodeId) continue

    const parentDoc = await getDoc(
      input.projectId,
      childDoc.parentGraphId,
      input.docsByGraphId
    )
    if (!parentDoc) continue

    const nextParentDoc = sanitizeDoc(
      applyChildLayerSummaryToParentDoc({
        parentDoc,
        childDoc,
      })
    )
    if (JSON.stringify(parentDoc.nodes) === JSON.stringify(nextParentDoc.nodes)) {
      continue
    }

    input.docsByGraphId.set(parentDoc.graphId, nextParentDoc)
    if (!input.dirtyGraphIds.has(parentDoc.graphId)) queue.push(parentDoc.graphId)
    input.dirtyGraphIds.add(parentDoc.graphId)
  }
}

export async function applyLlmCanvasImprovementProposal(input: {
  projectId: string
  currentGraphId: string
  proposal: unknown
}): Promise<LlmCanvasPatchApplyResult> {
  const proposal: LlmCanvasImprovementProposal = extractLlmCanvasImprovementProposal(
    input.proposal
  )
  const docsByGraphId = new Map<string, CanvasDocV1>()
  const dirtyGraphIds = new Set<string>()
  const issues: LlmCanvasPatchApplyIssue[] = []
  const tempIdMapsByGraphId = new Map<string, Map<string, string>>()
  const applied = {
    operations: 0,
    updateNodes: 0,
    addNodes: 0,
    addEdges: 0,
    createLayers: 0,
    updateGraphs: 0,
    skippedOperations: 0,
  }

  await getDoc(input.projectId, input.currentGraphId, docsByGraphId)

  for (const [operationIndex, operation] of proposal.operations.entries()) {
    if (!isRecord(operation) || typeof operation.op !== "string") {
      applied.skippedOperations += 1
      issue(issues, operationIndex, "Canvas patch operation is not a valid object.")
      continue
    }

    if (
      operation.op !== "update-node" &&
      operation.op !== "add-node" &&
      operation.op !== "add-edge" &&
      operation.op !== "create-layer" &&
      operation.op !== "update-graph"
    ) {
      applied.skippedOperations += 1
      issue(
        issues,
        operationIndex,
        `Unsupported patch operation "${operation.op}" was not applied.`
      )
      continue
    }

    if (operation.op === "create-layer") {
      const layerOperation = operation as CreateLayerOperation
      const parentGraphId = graphIdFromSearchParam(layerOperation.parentGraphId)
      const parentDoc = await getDoc(input.projectId, parentGraphId, docsByGraphId)
      if (!parentDoc) {
        applied.skippedOperations += 1
        issue(issues, operationIndex, `Parent graph not found: ${parentGraphId}.`)
        continue
      }

      const ok = await createLayer(
        input.projectId,
        parentDoc,
        layerOperation,
        docsByGraphId,
        dirtyGraphIds,
        operationIndex,
        issues
      )
      if (ok) {
        applied.operations += 1
        applied.createLayers += 1
      } else {
        applied.skippedOperations += 1
      }
      continue
    }

    const graphId =
      "graphId" in operation && typeof operation.graphId === "string"
        ? graphIdFromSearchParam(operation.graphId)
        : null
    if (!graphId || !isValidGraphId(graphId)) {
      applied.skippedOperations += 1
      issue(issues, operationIndex, "Invalid graphId.")
      continue
    }

    const doc = await getDoc(input.projectId, graphId, docsByGraphId)
    if (!doc) {
      applied.skippedOperations += 1
      issue(issues, operationIndex, `Graph not found: ${graphId}.`)
      continue
    }

    const tempIdMap =
      tempIdMapsByGraphId.get(graphId) ?? new Map<string, string>()
    tempIdMapsByGraphId.set(graphId, tempIdMap)

    if (operation.op === "update-node") {
      const updateNodeOperation = operation as UpdateNodeOperation
      const node = doc.nodes.find((item) => item.id === updateNodeOperation.nodeId)
      if (!node) {
        applied.skippedOperations += 1
        issue(issues, operationIndex, "Canvas patch references a missing node.")
        continue
      }
      const nextDoc = sanitizeDoc({
        ...doc,
        nodes: doc.nodes.map((item) =>
          item.id === node.id
            ? applyNodePatchData(item, updateNodeOperation.patch)
            : item
        ),
      })
      docsByGraphId.set(graphId, nextDoc)
      dirtyGraphIds.add(graphId)
      applied.operations += 1
      applied.updateNodes += 1
      continue
    }

    if (operation.op === "add-node") {
      const nextDoc = addNodeToDoc(
        doc,
        operation as AddNodeOperation,
        doc.nodes.length,
        tempIdMap
      )
      docsByGraphId.set(graphId, nextDoc)
      dirtyGraphIds.add(graphId)
      applied.operations += 1
      applied.addNodes += 1
      continue
    }

    if (operation.op === "add-edge") {
      const nextDoc = addEdgeToDoc(doc, operation as AddEdgeOperation, tempIdMap)
      if (!nextDoc) {
        applied.skippedOperations += 1
        issue(issues, operationIndex, "Canvas patch references a missing node.")
        continue
      }
      docsByGraphId.set(graphId, nextDoc)
      dirtyGraphIds.add(graphId)
      applied.operations += 1
      applied.addEdges += 1
      continue
    }

    if (operation.op === "update-graph") {
      const updateGraphOperation = operation as UpdateGraphOperation
      const patch = sanitizeLlmCanvasPatchRecord(updateGraphOperation.patch)
      const nextDoc: CanvasDocV1 = {
        ...doc,
        title: patchText(patch.title) ?? doc.title,
        summary:
          typeof patch.summary === "string" ? patch.summary.trim() || null : doc.summary,
        layerKind: patchText(patch.layerKind) ?? doc.layerKind,
        panels: patch.metadata
          ? { ...doc.panels, llmCanvasPatchMetadata: patch.metadata }
          : doc.panels,
      }
      docsByGraphId.set(graphId, nextDoc)
      dirtyGraphIds.add(graphId)
      applied.operations += 1
      applied.updateGraphs += 1
    }
  }

  await refreshDirtyChildLayerSummaries({
    projectId: input.projectId,
    docsByGraphId,
    dirtyGraphIds,
  })

  const writtenDocs: CanvasDocV1[] = []
  for (const graphId of dirtyGraphIds) {
    const doc = docsByGraphId.get(graphId)
    if (!doc) continue
    const { doc: writtenDoc } = await writeCanvasDoc(
      input.projectId,
      doc,
      writeOptionsForDoc(doc)
    )
    docsByGraphId.set(graphId, writtenDoc)
    writtenDocs.push(writtenDoc)
  }

  return {
    applied,
    dirtyGraphIds: [...dirtyGraphIds],
    docs: writtenDocs,
    issues,
  }
}
