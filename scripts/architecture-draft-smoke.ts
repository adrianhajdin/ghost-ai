import type { CanvasEdge, CanvasNode } from "@/types/canvas"
import { SHAPE_DEFAULTS } from "@/types/canvas"
import { MockAiProvider } from "@/lib/ai/providers/mock-provider"
import { createCanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { compileCanvasDocsToDesignIrResult } from "@/lib/canvas/design-ir"
import { baseNodeData } from "@/lib/canvas/semantic-defaults"
import { createEdgeLabelItems, mirrorEdgeLabelData } from "@/lib/canvas/edge-labels"
import { ROOT_GRAPH_ID } from "@/lib/canvas/graph-ids"
import {
  applyArchitectureDraftGraphToCanvasDoc,
  applyArchitectureDraftProposalToCanvasDoc,
  architectureDraftHasErrors,
  getArchitectureDraftGraphs,
  sanitizeArchitectureDraftProposal,
  validateArchitectureDraftProposal,
  type ArchitectureDraftProposal,
} from "@/lib/architecture-draft/architecture-draft"
import {
  compileDesignIrToPromptPack,
  renderPromptPackMarkdown,
} from "@/lib/prompt-pack/prompt-pack"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function node(id: string, label: string): CanvasNode {
  return {
    id,
    type: "canvasNode",
    position: { x: 0, y: 0 },
    selected: true,
    dragging: true,
    data: {
      ...baseNodeData(label),
      semanticType: "service",
      serviceKind: "application-service",
      runtime: "node-typescript",
      language: "typescript",
      framework: "nextjs",
      tenancy: "owner-scoped-now-workspace-compatible-later",
      authMode: "internal-cookie-session",
    },
    width: SHAPE_DEFAULTS.rectangle.width,
    height: SHAPE_DEFAULTS.rectangle.height,
  }
}

function edge(id: string, source: string, target: string): CanvasEdge {
  const labelItems = createEdgeLabelItems(["existing relation"], [], id)
  return {
    id,
    type: "canvasEdge",
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
    selected: true,
    data: {
      semanticType: "depends-on",
      ...mirrorEdgeLabelData(labelItems),
    },
  }
}

async function main() {
  const provider = new MockAiProvider()
  const input = {
    prompt: "Design a taxi booking dispatch and payments platform",
    projectId: "project-architecture-draft-smoke",
    graphId: ROOT_GRAPH_ID,
    complexity: "standard" as const,
    currentCanvasSummary: { nodeCount: 0, edgeCount: 0 },
    existingDesignIr: null,
  }

  const proposalA = await provider.generateArchitectureDraft(input)
  const proposalB = await provider.generateArchitectureDraft(input)
  const proposalJson = JSON.stringify(proposalA)

  assert(
    proposalJson === JSON.stringify(proposalB),
    "Mock architecture draft is not deterministic"
  )
  assert(proposalA.targetGraphId === ROOT_GRAPH_ID, "Proposal did not target graph_root")
  assert(proposalA.nodes.some((item) => item.semanticType === "service"), "Missing service node")
  assert(proposalA.nodes.some((item) => item.semanticType === "database"), "Missing database node")
  assert(proposalA.nodes.some((item) => item.semanticType === "worker"), "Missing worker node")
  assert(proposalA.nodes.some((item) => item.semanticType === "auth-module"), "Missing auth node")
  assert(proposalA.nodes.some((item) => item.semanticType === "frontend"), "Missing frontend node")
  assert(proposalA.nodes.some((item) => item.semanticType === "external-system"), "Missing external system node")
  assert(proposalA.graphs.length > 0, "Missing layered graph proposal")
  assert(
    proposalA.graphs.some((graph) => graph.parentNodeTempId),
    "Layered proposal did not include parentNodeTempId"
  )
  assert(!proposalJson.includes("```"), "Proposal contains code fences")
  assert(!proposalJson.includes("npm install"), "Proposal contains app build instructions")
  assert(!proposalJson.toLowerCase().includes("nimbus"), "Proposal mentioned Nimbus")

  const validation = validateArchitectureDraftProposal(proposalA, {
    targetGraphId: ROOT_GRAPH_ID,
  })
  assert(!architectureDraftHasErrors(validation), "Valid taxi proposal has validation errors")

  const customSemantic = structuredClone(proposalA) as ArchitectureDraftProposal
  customSemantic.nodes[0].semanticType = "not-a-real-type"
  assert(
    !architectureDraftHasErrors(validateArchitectureDraftProposal(customSemantic)),
    "Custom semantic type was rejected"
  )
  const customEdgeSemantic = structuredClone(proposalA) as ArchitectureDraftProposal
  customEdgeSemantic.edges[0].semanticType = "custom-relation"
  assert(
    !architectureDraftHasErrors(validateArchitectureDraftProposal(customEdgeSemantic)),
    "Custom edge type was rejected"
  )

  const missingRef = structuredClone(proposalA) as ArchitectureDraftProposal
  missingRef.edges[0].target = "missing-node"
  assert(
    architectureDraftHasErrors(validateArchitectureDraftProposal(missingRef)),
    "Missing edge ref was not rejected"
  )

  const rawSecret = structuredClone(proposalA) as ArchitectureDraftProposal
  rawSecret.nodes[0].metadata.apiKey = "sk-abcdefghijklmnopqrstuvwxyz123456"
  const rawSecretValidation = validateArchitectureDraftProposal(rawSecret)
  assert(architectureDraftHasErrors(rawSecretValidation), "Raw secret was not rejected")
  const redacted = sanitizeArchitectureDraftProposal(rawSecret)
  const redactedJson = JSON.stringify(redacted)
  assert(!redactedJson.includes("sk-abcdefghijklmnopqrstuvwxyz123456"), "Raw secret was not redacted")
  assert(
    JSON.stringify(proposalA).includes("secretRef:provider/api-key"),
    "secretRef did not survive proposal generation"
  )

  const transient = structuredClone(proposalA) as ArchitectureDraftProposal & {
    nodes: Array<ArchitectureDraftProposal["nodes"][number] & { selected?: boolean }>
  }
  transient.nodes[0].selected = true
  assert(
    architectureDraftHasErrors(validateArchitectureDraftProposal(transient)),
    "Transient UI state was not rejected"
  )
  assert(
    !JSON.stringify(sanitizeArchitectureDraftProposal(transient)).includes("selected"),
    "Transient UI state was not stripped"
  )

  const firstNode = proposalA.nodes[0]
  const firstEdge = proposalA.edges[0]
  assert(firstNode.id, "First proposal node is missing id")
  assert(firstEdge.id, "First proposal edge is missing id")
  const firstNodeId = firstNode.id
  const firstEdgeId = firstEdge.id
  const existingOtherNode = node("existing-target", "Existing Target")
  const rootDoc = createCanvasDocV1(
    {
      nodes: [node(firstNodeId, "Existing Passenger App"), existingOtherNode],
      edges: [edge(firstEdgeId, firstNodeId, existingOtherNode.id)],
    },
    {
      projectId: input.projectId,
      graphId: ROOT_GRAPH_ID,
      scopeKind: "system-root",
      title: "Architecture Draft Smoke",
    }
  )

  const applyResult = applyArchitectureDraftProposalToCanvasDoc(rootDoc, proposalA)
  assert(applyResult.ok, "Architecture draft apply was blocked")
  assert(applyResult.appliedNodes === proposalA.nodes.length, "Apply did not append all nodes")
  assert(applyResult.appliedEdges === proposalA.edges.length, "Apply did not append all edges")
  assert(
    applyResult.doc.nodes.some((item) => item.id === firstNode.id),
    "Existing colliding node was removed"
  )
  assert(
    applyResult.idMap[firstNodeId] === `${firstNodeId}-2`,
    "Node collision did not resolve deterministically"
  )
  assert(
    applyResult.idMap[firstEdgeId] === `${firstEdgeId}-2`,
    "Edge collision did not resolve deterministically"
  )
  const mappedEdge = applyResult.doc.edges.find(
    (item) => item.id === applyResult.idMap[firstEdgeId]
  )
  assert(mappedEdge, "Mapped edge was not created")
  assert(
    mappedEdge.source === applyResult.idMap[firstEdge.source],
    "Mapped edge source was not updated after node collision"
  )
  assert(
    Array.isArray(mappedEdge.data?.labels) && mappedEdge.data.labels.length > 0,
    "Applied edge labels were not mirrored"
  )
  assert(
    Array.isArray(mappedEdge.data?.labelItems) && mappedEdge.data.labelItems.length > 0,
    "Applied edge labelItems were not created"
  )
  const customApplyResult = applyArchitectureDraftProposalToCanvasDoc(rootDoc, customSemantic)
  assert(customApplyResult.ok, "Custom semantic proposal was blocked")
  const appliedCustomNode = customApplyResult.doc.nodes.find(
    (item) => item.id === customApplyResult.idMap[customSemantic.nodes[0].id!]
  )
  assert(appliedCustomNode, "Custom semantic node was not applied")
  assert(
    appliedCustomNode.data.semanticType === "unclassified",
    "Custom semantic node did not use a safe canvas fallback"
  )
  assert(
    appliedCustomNode.data.llmSemanticType === "not-a-real-type",
    "Custom semantic node type was not preserved"
  )
  assert(
    !JSON.stringify(applyResult.doc).includes("selected") &&
      !JSON.stringify(applyResult.doc).includes("dragging"),
    "Applied CanvasDoc persisted UI state"
  )

  const graphs = getArchitectureDraftGraphs(proposalA)
  const childGraph = graphs.find((graph) => graph.parentNodeTempId)
  assert(childGraph?.graphId, "Layered proposal did not expose child graph id")
  const childDoc = createCanvasDocV1(
    { nodes: [], edges: [] },
    {
      projectId: input.projectId,
      graphId: childGraph.graphId,
      parentGraphId: ROOT_GRAPH_ID,
      parentNodeId: applyResult.idMap[childGraph.parentNodeTempId!],
      scopeKind: "architecture-layer",
      title: childGraph.title,
      layer: childGraph.layer,
      layerKind: childGraph.layerKind,
      summary: childGraph.summary,
    }
  )
  const childApplyResult = applyArchitectureDraftGraphToCanvasDoc(
    childDoc,
    proposalA,
    childGraph
  )
  assert(childApplyResult.ok, "Layered child graph apply was blocked")
  assert(
    childApplyResult.appliedNodes === childGraph.nodes.length,
    "Child graph did not append all nodes"
  )
  const rootWithChildRef = {
    ...applyResult.doc,
    nodes: applyResult.doc.nodes.map((item) =>
      item.id === applyResult.idMap[childGraph.parentNodeTempId!]
        ? {
            ...item,
            data: {
              ...item.data,
              subcanvasRef: {
                graphId: childGraph.graphId!,
                scopeKind: "architecture-layer" as const,
                parentGraphId: ROOT_GRAPH_ID,
                parentNodeId: item.id,
                layer: childGraph.layer,
                layerKind: childGraph.layerKind,
                title: childGraph.title,
                summary: childGraph.summary,
              },
            },
          }
        : item
    ),
  }

  const designIrResult = compileCanvasDocsToDesignIrResult([rootWithChildRef, childApplyResult.doc], {
    projectId: input.projectId,
    projectName: "Architecture Draft Smoke",
  })
  assert(
    designIrResult.ir.services.some((item) => item.name === "Booking Service"),
    "Design IR did not include applied service"
  )
  assert(
    designIrResult.ir.dataModels.some((item) => item.name === "Trip Database"),
    "Design IR did not include applied database"
  )
  assert(designIrResult.ir.graphs.length >= 2, "Design IR did not include child graph")

  const promptPack = compileDesignIrToPromptPack(designIrResult.ir, {
    targetAgent: "codex",
  })
  const promptPackMarkdown = renderPromptPackMarkdown(promptPack)
  assert(promptPackMarkdown.includes("Booking Service"), "Prompt Pack missed applied service")
  assert(!promptPackMarkdown.toLowerCase().includes("nimbus"), "Prompt Pack mentioned Nimbus")

  console.info("Architecture draft smoke passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
