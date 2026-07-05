import { access, mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { CanvasEdge, CanvasNode } from "@/types/canvas"
import { SHAPE_DEFAULTS } from "@/types/canvas"
import { prisma } from "@/lib/prisma"
import { createCanvasDocV1 } from "@/lib/canvas/canvas-doc"
import {
  loadProjectCanvasPyramid,
} from "@/lib/canvas/canvas-pyramid"
import {
  GRAPH_SUMMARY_CACHE_PANEL_KEY,
  createGraphSummaryCache,
  graphSummaryCacheFromDoc,
} from "@/lib/canvas/graph-summary-cache"
import {
  CANVAS_ACTIVITY_PANEL_KEY,
  createCanvasActivityEvent,
  withCanvasActivity,
} from "@/lib/canvas/canvas-activity"
import {
  applyLlmCanvasImprovementProposal,
  previewLlmCanvasImprovementProposal,
} from "@/lib/canvas/llm-canvas-patch"
import { readCanvasDoc, writeCanvasDoc } from "@/lib/canvas/canvas-persistence"
import { buildLlmContextPyramid } from "@/lib/ai/context/llm-context-pyramid"
import {
  buildArchitectSystemPrompt,
  buildArchitectUserPrompt,
} from "@/lib/ai/architect/architect-provider-contract"
import { buildArchitectApplyFeedbackMessage } from "@/lib/ai/architect/architect-apply-feedback"
import {
  buildPromptPackSystemPrompt,
  buildPromptPackUserPrompt,
} from "@/lib/ai/prompt-pack/prompt-pack-provider-contract"
import { ROOT_GRAPH_ID } from "@/lib/canvas/graph-ids"
import { baseNodeData } from "@/lib/canvas/semantic-defaults"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function pathExists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function node(
  id: string,
  label: string,
  data: Partial<CanvasNode["data"]> = {}
): CanvasNode {
  return {
    id,
    type: "canvasNode",
    position: { x: 80, y: 80 },
    selected: true,
    dragging: true,
    width: SHAPE_DEFAULTS.rectangle.width,
    height: SHAPE_DEFAULTS.rectangle.height,
    data: {
      ...baseNodeData(label),
      label,
      name: label,
      description: `${label} role.`,
      semanticType: "service",
      owner: "",
      status: "draft",
      ...data,
    },
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  data: Partial<NonNullable<CanvasEdge["data"]>> = {}
): CanvasEdge {
  return {
    id,
    type: "canvasEdge",
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
    selected: true,
    data: {
      semanticType: "calls",
      relationshipType: "calls",
      label: "calls",
      labels: ["calls"],
      status: "draft",
      owner: null,
      ...data,
    },
  }
}

async function main() {
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), "arc-forge-phase4-"))
  process.env.AI_PROVIDER = "mock"
  process.env.STORAGE_PROVIDER = "local_fs"
  process.env.LOCAL_STORAGE_ROOT = storageRoot

  const projectId = "project-canvas-v2-phase4-smoke"
  const userId = "user-canvas-v2-phase4-smoke"
  const childGraphId = "graph_phase4_existing_child"
  const catalog = node("catalog-service", "Catalog Service", {
    semanticType: "service",
    responsibilities: ["Serve product catalog"],
    owner: "catalog-team",
    secretRef: "secretRef:catalog/api-key",
    apiKey: "sk-abcdefghijklmnopqrstuvwxyz123456",
  })
  const database = node("product-database", "Product Database", {
    semanticType: "database",
    engine: "postgresql",
    owner: "data-team",
  })
  const checkout = node("checkout-service", "Checkout Service", {
    semanticType: "service",
    subcanvasRef: {
      graphId: childGraphId,
      scopeKind: "architecture-layer",
      title: "Checkout Internals",
    },
  })
  const checkoutReference = node("checkout-layer-reference", "Checkout Layer Reference", {
    semanticType: "reference-proxy",
    referenceKind: "graph",
    referencedGraphId: childGraphId,
    referencedLabel: "Checkout Internals",
    referenceRole: "Cross-layer context for checkout details",
  })
  const rootDoc = createCanvasDocV1(
    {
      nodes: [catalog, database, checkout, checkoutReference],
      edges: [edge("edge-catalog-db", catalog.id, database.id)],
    },
    {
      projectId,
      graphId: ROOT_GRAPH_ID,
      scopeKind: "system-root",
      title: "Phase 4 Smoke",
      summary: "Phase 4 smoke architecture.",
    }
  )
  const emptyChildDoc = createCanvasDocV1(
    { nodes: [], edges: [] },
    {
      projectId,
      graphId: childGraphId,
      parentGraphId: ROOT_GRAPH_ID,
      parentNodeId: checkout.id,
      scopeKind: "architecture-layer",
      title: "Checkout Internals",
      layer: 1,
      layerKind: "architecture-layer",
    }
  )

  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.user.create({
    data: {
      id: userId,
      email: "canvas-v2-phase4-smoke@example.test",
      name: "Canvas v2 Phase 4 Smoke",
    },
  })
  await prisma.project.create({
    data: {
      id: projectId,
      ownerId: userId,
      name: "Canvas v2 Phase 4 Smoke",
    },
  })

  await writeCanvasDoc(projectId, rootDoc, {
    graphId: ROOT_GRAPH_ID,
    scopeKind: "system-root",
    title: rootDoc.title,
    summary: rootDoc.summary,
  })
  await writeCanvasDoc(projectId, emptyChildDoc, {
    graphId: childGraphId,
    parentGraphId: ROOT_GRAPH_ID,
    parentNodeId: checkout.id,
    scopeKind: "architecture-layer",
    title: emptyChildDoc.title,
    layer: 1,
    layerKind: "architecture-layer",
  })

  const writtenRoot = await readCanvasDoc(projectId, ROOT_GRAPH_ID)
  assert(writtenRoot, "Root doc was not persisted")
  const rootCache = graphSummaryCacheFromDoc(writtenRoot)
  assert(
    writtenRoot.panels[GRAPH_SUMMARY_CACHE_PANEL_KEY],
    "Graph summary cache was not written to CanvasDoc panels"
  )
  assert(rootCache.summary.includes("4 nodes, 1 edge"), "Graph summary cache missed counts")
  assert(!/complete|good|quality/i.test(rootCache.summary), "Graph summary cache judged architecture quality")

  const directCache = createGraphSummaryCache(emptyChildDoc)
  assert(directCache.summary === "Empty child layer", "Empty graph summary cache should be factual")
  const manualActivityDoc = withCanvasActivity(
    rootDoc,
    createCanvasActivityEvent({
      kind: "manual-save",
      actor: "user",
      beforeDoc: null,
      afterDoc: rootDoc,
      at: "2026-01-01T00:00:00.000Z",
    })
  )
  assert(
    manualActivityDoc.panels[CANVAS_ACTIVITY_PANEL_KEY],
    "Canvas activity panel did not record manual save feedback"
  )

  const pyramid = await loadProjectCanvasPyramid(projectId)
  assert(pyramid.graphs.length === 2, "Canvas pyramid missed child graph")
  assert(
    pyramid.graphIndex.some((entry) => entry.summary.includes("4 nodes, 1 edge")),
    "Canvas pyramid graph index missed summary cache"
  )
  assert(
    !JSON.stringify(pyramid).includes("sk-abcdefghijklmnopqrstuvwxyz123456"),
    "Raw secret leaked into canvas pyramid"
  )
  assert(JSON.stringify(pyramid).includes("secretRef:catalog/api-key"), "secretRef was stripped")

  const context = buildLlmContextPyramid({
    projectId,
    projectName: "Canvas v2 Phase 4 Smoke",
    providerName: "mock",
    currentGraphId: ROOT_GRAPH_ID,
    selectedNodeIds: [catalog.id],
    recentMessages: [
      {
        role: "user",
        graphId: ROOT_GRAPH_ID,
        createdAt: new Date().toISOString(),
        content: "Improve Catalog Service.",
      },
      {
        role: "assistant",
        graphId: childGraphId,
        createdAt: new Date().toISOString(),
        content: "I proposed internal checkout nodes.",
      },
    ],
    canvasPyramid: pyramid,
  })
  const contextJson = JSON.stringify(context)
  assert(context.contextVersion === "2.0.0", "LLM context missed version")
  assert(context.provider.providerName === "mock", "LLM context missed provider metadata")
  assert(context.currentGraph?.graphId === ROOT_GRAPH_ID, "LLM context missed current graph")
  assert(context.selectedNodes[0]?.id === catalog.id, "LLM context missed selected node")
  assert(context.connectedEdges.some((item) => item.id === "edge-catalog-db"), "LLM context missed connected edge")
  assert(context.relatedGraphSummaries.some((item) => item.graphId === childGraphId), "LLM context missed related child graph")
  assert(
    context.relatedGraphSummaries.some((item) => item.graphId === childGraphId && item.relation === "referenced"),
    "LLM context missed reference proxy target summary"
  )
  assert(context.focus.ancestorPath.some((item) => item.graphId === ROOT_GRAPH_ID), "LLM context missed ancestor path")
  assert(context.semanticWarnings.length > 0, "LLM context missed semantic warnings")
  assert(context.budget.estimatedCharacters > 0, "LLM context missed budget estimate")
  assert(context.budget.omittedGraphCount >= 0, "LLM context missed omitted counts")
  assert(context.recentConversation.some((item) => item.graphId === childGraphId), "LLM context missed graph provenance")
  assert(
    context.appFeedback.source === "arc-forge-application-state",
    "LLM context missed application-state feedback channel"
  )
  assert(
    context.appFeedback.currentGraphFacts?.semanticScanActiveCount ===
      context.currentGraph?.semanticScan.activeCount,
    "LLM app feedback missed current graph semantic scan facts"
  )
  assert(!contextJson.includes('"position"'), "LLM context should not include node coordinates")
  assert(!contextJson.includes('"selected"'), "LLM context leaked selected UI state")
  assert(!contextJson.includes('"dragging"'), "LLM context leaked dragging UI state")
  assert(!contextJson.includes("sk-abcdefghijklmnopqrstuvwxyz123456"), "LLM context leaked a raw secret")

  const addWithTempIds = {
    proposalVersion: "2.0.0",
    summary: "Add a pricing service and connect it to catalog.",
    operations: [
      {
        op: "add-node",
        graphId: ROOT_GRAPH_ID,
        tempId: "tmp_pricing_service",
        node: {
          tempId: "tmp_pricing_service",
          label: "Pricing Service",
          semanticType: "service",
          description: "Calculates price rules.",
        },
      },
      {
        op: "add-edge",
        graphId: ROOT_GRAPH_ID,
        tempId: "tmp_pricing_catalog_edge",
        edge: {
          tempId: "tmp_pricing_catalog_edge",
          source: "tmp_pricing_service",
          target: catalog.id,
          relationshipType: "calls",
          label: "reads catalog prices",
        },
      },
    ],
  }
  const tempPreview = await previewLlmCanvasImprovementProposal({
    projectId,
    currentGraphId: ROOT_GRAPH_ID,
    proposal: addWithTempIds,
  })
  assert(tempPreview.canApply, "Valid tempId patch preview should be applyable")
  assert(
    tempPreview.tempIdMappings.some((mapping) => mapping.tempId === "tmp_pricing_service"),
    "Temp node mapping missing from preview"
  )
  assert(
    tempPreview.affectedGraphIds.includes(ROOT_GRAPH_ID),
    "Preview missed affected root graph"
  )
  const tempApply = await applyLlmCanvasImprovementProposal({
    projectId,
    currentGraphId: ROOT_GRAPH_ID,
    proposal: addWithTempIds,
  })
  assert(tempApply.applied.addNodes === 1, "Temp node patch did not apply")
  assert(tempApply.applied.addEdges === 1, "Temp edge patch did not apply")
  const rootAfterTempApply = await readCanvasDoc(projectId, ROOT_GRAPH_ID)
  assert(rootAfterTempApply, "Root missing after temp apply")
  assert(
    rootAfterTempApply.nodes.some((item) => item.data.label === "Pricing Service"),
    "Temp node was not persisted as a real node"
  )
  assert(
    !rootAfterTempApply.nodes.some((item) => item.id.startsWith("tmp_")),
    "Temp node id persisted into CanvasDoc"
  )
  assert(
    !rootAfterTempApply.edges.some((item) => item.id.startsWith("tmp_")),
    "Temp edge id persisted into CanvasDoc"
  )

  const updateEdgePatch = {
    summary: "Clarify relationship semantics.",
    operations: [
      {
        op: "update-edge",
        graphId: ROOT_GRAPH_ID,
        edgeId: "edge-catalog-db",
        patch: {
          relationshipType: "reads",
          label: "reads product data",
          dataSubject: "product catalog",
        },
      },
    ],
  }
  const updateEdgePreview = await previewLlmCanvasImprovementProposal({
    projectId,
    currentGraphId: ROOT_GRAPH_ID,
    proposal: updateEdgePatch,
  })
  assert(updateEdgePreview.canApply, "Valid update-edge preview should be applyable")
  const updateEdgeApply = await applyLlmCanvasImprovementProposal({
    projectId,
    currentGraphId: ROOT_GRAPH_ID,
    proposal: updateEdgePatch,
  })
  assert(updateEdgeApply.applied.updateEdges === 1, "update-edge patch did not apply")
  const updateEdgeFeedback = buildArchitectApplyFeedbackMessage({
    currentGraphId: ROOT_GRAPH_ID,
    result: updateEdgeApply,
    broadcastedGraphIds: [ROOT_GRAPH_ID],
    realtimeBroadcastFailures: [],
  })
  assert(
    updateEdgeFeedback.content.includes("Apply to canvas completed"),
    "Architect apply feedback missed user-facing apply copy"
  )
  assert(
    !updateEdgeFeedback.content.includes("canvasPatchProposal"),
    "Architect apply feedback leaked internal patch field name"
  )
  assert(
    updateEdgeFeedback.summary.semanticScanAfterApply.some(
      (summary) => summary.graphId === ROOT_GRAPH_ID
    ),
    "Architect apply feedback missed semantic scan summary"
  )
  const rootAfterEdgeApply = await readCanvasDoc(projectId, ROOT_GRAPH_ID)
  const updatedEdge = rootAfterEdgeApply?.edges.find((item) => item.id === "edge-catalog-db")
  assert(updatedEdge?.data?.relationshipType === "reads", "update-edge did not persist relationshipType")
  assert(updatedEdge?.data?.label === "reads product data", "update-edge did not persist label")
  const applyActivity = rootAfterEdgeApply?.panels[CANVAS_ACTIVITY_PANEL_KEY]
  assert(
    JSON.stringify(applyActivity).includes("architect-apply") &&
      JSON.stringify(applyActivity).includes("activeSemanticFindings"),
    "Apply did not persist factual canvas activity for LLM context"
  )

  const unknownTempPatch = {
    summary: "Invalid edge should block apply.",
    operations: [
      {
        op: "add-edge",
        graphId: ROOT_GRAPH_ID,
        edge: {
          source: "tmp_missing_node",
          target: catalog.id,
          relationshipType: "calls",
          label: "invalid",
        },
      },
    ],
  }
  const unknownPreview = await previewLlmCanvasImprovementProposal({
    projectId,
    currentGraphId: ROOT_GRAPH_ID,
    proposal: unknownTempPatch,
  })
  assert(!unknownPreview.canApply, "Unknown tempId preview should block apply")
  assert(unknownPreview.blockingIssueCount > 0, "Unknown tempId did not create blocking issue")
  const blockedApply = await applyLlmCanvasImprovementProposal({
    projectId,
    currentGraphId: ROOT_GRAPH_ID,
    proposal: unknownTempPatch,
  })
  assert(blockedApply.applied.operations === 0, "Blocked patch should not apply operations")
  assert(blockedApply.dirtyGraphIds.length === 0, "Blocked patch should not dirty graphs")

  const layerPatch = {
    summary: "Populate existing child layer.",
    operations: [
      {
        op: "create-layer",
        parentGraphId: ROOT_GRAPH_ID,
        parentNodeId: checkout.id,
        graph: {
          title: "Checkout Internals",
          layerKind: "architecture-layer",
          summary: "Checkout internal flow.",
          nodes: [
            {
              tempId: "tmp_checkout_endpoint",
              label: "POST /checkout",
              semanticType: "endpoint",
              description: "Accepts checkout requests.",
            },
            {
              tempId: "tmp_checkout_rule",
              label: "Checkout Validation Rule",
              semanticType: "validation-rule",
              description: "Validates cart and payment readiness.",
            },
          ],
          edges: [
            {
              tempId: "tmp_checkout_rule_edge",
              source: "tmp_checkout_endpoint",
              target: "tmp_checkout_rule",
              relationshipType: "depends_on",
              label: "validates with",
            },
          ],
        },
      },
    ],
  }
  const layerPreview = await previewLlmCanvasImprovementProposal({
    projectId,
    currentGraphId: ROOT_GRAPH_ID,
    proposal: layerPatch,
  })
  assert(layerPreview.canApply, "Existing child layer preview should be applyable")
  assert(
    layerPreview.affectedGraphIds.includes(childGraphId),
    "Existing child layer preview missed child graph"
  )
  const layerApply = await applyLlmCanvasImprovementProposal({
    projectId,
    currentGraphId: ROOT_GRAPH_ID,
    proposal: layerPatch,
  })
  assert(layerApply.applied.createLayers === 1, "Existing child layer was not reused")
  assert(layerApply.applied.skippedOperations === 0, "Existing child layer was skipped")
  const childAfterApply = await readCanvasDoc(projectId, childGraphId)
  assert(childAfterApply, "Existing child graph missing after apply")
  assert(childAfterApply.nodes.length === 2, "Existing child layer did not receive nodes")
  assert(childAfterApply.edges.length === 1, "Existing child layer did not receive edge")
  assert(
    !JSON.stringify(childAfterApply).includes("tmp_checkout"),
    "Create-layer temp IDs persisted into child CanvasDoc"
  )
  assert(
    graphSummaryCacheFromDoc(childAfterApply).summary.includes("2 nodes, 1 edge"),
    "Child graph summary cache did not refresh after create-layer apply"
  )

  const destructivePreview = await previewLlmCanvasImprovementProposal({
    projectId,
    currentGraphId: ROOT_GRAPH_ID,
    proposal: {
      summary: "Unsupported delete should remain unsupported.",
      operations: [
        {
          op: ["delete", "node"].join("-"),
          graphId: ROOT_GRAPH_ID,
          nodeId: database.id,
        },
      ],
    },
  })
  assert(destructivePreview.canApply, "Unsupported advisory operation should not block harmless apply")
  assert(
    destructivePreview.issues.some((issue) => issue.message.includes("Unsupported patch operation")),
    "Unsupported destructive operation did not surface an issue"
  )
  const destructiveApply = await applyLlmCanvasImprovementProposal({
    projectId,
    currentGraphId: ROOT_GRAPH_ID,
    proposal: {
      summary: "Unsupported delete should be skipped.",
      operations: [
        {
          op: ["delete", "node"].join("-"),
          graphId: ROOT_GRAPH_ID,
          nodeId: database.id,
        },
      ],
    },
  })
  assert(destructiveApply.applied.skippedOperations === 1, "Unsupported delete was not skipped")
  const afterDeleteAttempt = await readCanvasDoc(projectId, ROOT_GRAPH_ID)
  assert(
    afterDeleteAttempt?.nodes.some((item) => item.id === database.id),
    "Unsupported delete removed a node"
  )

  const architectPrompt = buildArchitectUserPrompt({
    projectId,
    projectName: "Canvas v2 Phase 4 Smoke",
    currentGraphId: ROOT_GRAPH_ID,
    userId,
    providerName: "mock",
    isMockProvider: true,
    userMessage: "Improve Catalog Service",
    selectedNodeIds: [catalog.id],
    recentMessages: context.recentConversation,
    canvasPyramid: await loadProjectCanvasPyramid(projectId),
    llmContextPyramid: context,
  })
  assert(architectPrompt.includes("LLM context pyramid"), "Architect prompt missed LLM context pyramid")
  assert(architectPrompt.includes("unknown tempId references block apply"), "Architect prompt missed tempId guardrail")
  assert(architectPrompt.includes("Temp IDs are transport references only"), "Architect prompt missed tempId persistence rule")
  assert(buildArchitectSystemPrompt().includes("update-edge"), "Architect prompt missed update-edge support")
  assert(
    buildArchitectSystemPrompt().includes("Apply to canvas") &&
      buildArchitectSystemPrompt().includes("authoritative app feedback"),
    "Architect prompt missed Apply to canvas feedback instructions"
  )
  assert(
    architectPrompt.includes("appFeedback") &&
      architectPrompt.includes("application-state feedback"),
    "Architect user prompt missed structured app feedback"
  )

  const promptPackPrompt = buildPromptPackUserPrompt({
    projectId,
    projectName: "Canvas v2 Phase 4 Smoke",
    targetAgent: "codex",
    scopeMode: "full-project",
    currentGraphId: ROOT_GRAPH_ID,
    selectedNodeIds: [],
    instructions: "Generate implementation prompts.",
    canvasPyramid: await loadProjectCanvasPyramid(projectId),
    llmContextPyramid: context,
  })
  assert(promptPackPrompt.includes("LLM context pyramid JSON"), "Prompt Pack prompt missed LLM context pyramid")
  const promptPackSystem = buildPromptPackSystemPrompt()
  assert(
    promptPackSystem.includes("Treat missing owner metadata, empty child layers, untyped edges, and trust boundary advisories") &&
      promptPackSystem.includes("must not prevent Prompt Pack generation"),
    "Prompt Pack prompt reintroduced advisory blockers"
  )
  const promptPackJudgingTerms = [
    ["architecture", "score"].join(" "),
    ["quality", "gate"].join(" "),
    ["architecture", "completeness", "gate"].join(" "),
    ["deterministic", "judge"].join(" "),
  ]
  assert(
    !promptPackJudgingTerms.some((term) => new RegExp(term, "i").test(promptPackSystem)),
    "Prompt Pack prompt reintroduced deterministic quality judging"
  )
  assert(
    buildArchitectSystemPrompt().includes("Never propose removal operations"),
    "Architect system prompt missed removal operation guardrail"
  )

  const aiSidebarSource = await readFile(
    path.join(process.cwd(), "components", "editor", "ai-sidebar.tsx"),
    "utf8"
  )
  assert(aiSidebarSource.includes("Affected graphs"), "Architect preview UI missed affected graphs")
  assert(aiSidebarSource.includes("Temp ID mappings"), "Architect preview UI missed tempId mappings")
  assert(aiSidebarSource.includes("blocking issue"), "Architect preview UI missed blocking issue copy")
  const semanticInspectorSource = await readFile(
    path.join(process.cwd(), "components", "editor", "canvas", "semantic-inspector.tsx"),
    "utf8"
  )
  assert(semanticInspectorSource.includes("Ask Architect"), "Semantic Scan UI missed Ask Architect action")
  assert(semanticInspectorSource.includes("Fix"), "Semantic Scan UI missed Fix action")
  assert(
    semanticInspectorSource.includes("Apply to canvas"),
    "Semantic Scan Fix prompt missed Apply to canvas wording"
  )
  assert(
    !semanticInspectorSource.includes("user-approved canvasPatchProposal"),
    "Semantic Scan Fix prompt leaked internal patch field name"
  )
  assert(
    semanticInspectorSource.includes("onSendSemanticFindingToArchitect"),
    "Semantic Scan UI missed Architect command bridge"
  )

  const legacyDesignRoute = path.join(process.cwd(), "app", "api", "ai", "design", "route.ts")
  assert(!(await pathExists(legacyDesignRoute)), "Legacy deterministic design route returned")

  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await rm(storageRoot, { recursive: true, force: true })
  await prisma.$disconnect()
  console.log("canvas v2 phase4 smoke passed")
}

main().catch(async (error: unknown) => {
  console.error(error)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
