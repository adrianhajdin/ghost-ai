import { access, mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { CanvasEdge, CanvasNode, SemanticEdgeType } from "@/types/canvas"
import { SHAPE_DEFAULTS } from "@/types/canvas"
import { MockAiProvider } from "@/lib/ai/providers/mock-provider"
import { createCanvasDocV1 } from "@/lib/canvas/canvas-doc"
import {
  buildCanvasPyramidFromDocs,
  loadProjectCanvasPyramid,
} from "@/lib/canvas/canvas-pyramid"
import { writeCanvasDoc } from "@/lib/canvas/canvas-persistence"
import { baseNodeData } from "@/lib/canvas/semantic-defaults"
import { createEdgeLabelItems, mirrorEdgeLabelData } from "@/lib/canvas/edge-labels"
import { ROOT_GRAPH_ID } from "@/lib/canvas/graph-ids"
import { prisma } from "@/lib/prisma"
import { applyLlmCanvasImprovementProposal } from "@/lib/prompt-pack/canvas-patch"
import {
  LLM_PROMPT_PACK_TARGET_AGENTS,
  parseLlmPromptPackProposal,
} from "@/lib/prompt-pack/llm-prompt-pack"

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
    position: { x: 0, y: 0 },
    selected: true,
    dragging: true,
    data: {
      ...baseNodeData(label),
      ...data,
    },
    width: SHAPE_DEFAULTS.rectangle.width,
    height: SHAPE_DEFAULTS.rectangle.height,
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  semanticType: SemanticEdgeType | string,
  labels: string[]
): CanvasEdge {
  const labelItems = createEdgeLabelItems(
    labels,
    labels.map((text, index) => ({ id: `${id}-label-${index}`, text })),
    id
  )

  return {
    id,
    type: "canvasEdge",
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
    selected: true,
    data: {
      semanticType: semanticType as SemanticEdgeType,
      ...mirrorEdgeLabelData(labelItems),
    },
  }
}

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), "arc-forge-prompt-pack-smoke-"))
  process.env.STORAGE_PROVIDER = "local_fs"
  process.env.LOCAL_STORAGE_ROOT = root

  const projectId = "project-llm-prompt-pack-smoke"
  const userId = "user-llm-prompt-pack-smoke"
  const childGraphId = "graph_service_billing"
  const nestedGraphId = "graph_service_billing_endpoint"

  const serviceNode = node("service-billing", "Billing Service", {
    semanticType: "service",
    serviceKind: "application-service",
    runtime: "node-typescript",
    language: "typescript",
    framework: "nextjs",
    tenancy: "owner-scoped-now-workspace-compatible-later",
    authMode: "internal-cookie-session",
    sourceRefs: ["docs/billing.md"],
    assumptions: ["Invoices are owner scoped."],
    subcanvasRef: {
      graphId: childGraphId,
      scopeKind: "service-internal",
      title: "Billing Service",
    },
  })
  const databaseNode = node("database-ledger", "Ledger Database", {
    semanticType: "database",
    dbKind: "relational",
    engine: "postgresql",
    orm: "prisma",
    secretRef: "secretRef:database/connection-string",
  })
  const customNode = node("ai-orchestrator", "AI Orchestrator", {
    semanticType: "unclassified",
    llmSemanticType: "llm-agent-orchestrator",
    architectureType: "ai-agent-orchestrator",
    originalSemanticType: "llm-agent",
    description: "contains raw token sk-abcdefghijklmnopqrstuvwxyz123456",
    secretCapabilityRef: "secretCapabilityRef:llm/provider",
    apiKey: "sk-abcdefghijklmnopqrstuvwxyz123456",
  })
  const rootDoc = createCanvasDocV1(
    {
      nodes: [serviceNode, databaseNode, customNode],
      edges: [
        edge("edge-service-db", serviceNode.id, databaseNode.id, "db-write", [
          "writes invoices",
        ]),
        {
          ...edge("edge-custom-ai", serviceNode.id, customNode.id, "unclassified", [
            "asks AI",
          ]),
          data: {
            semanticType: "unclassified",
            llmSemanticType: "llm-call-with-tools",
            architectureType: "agent-tool-call",
            originalSemanticType: "ai-tool-call",
            ...mirrorEdgeLabelData(
              createEdgeLabelItems(["asks AI"], [], "edge-custom-ai")
            ),
          },
        },
      ],
    },
    {
      projectId,
      graphId: ROOT_GRAPH_ID,
      scopeKind: "system-root",
      title: "Prompt Pack Smoke",
    }
  )
  ;(rootDoc.nodes[0] as CanvasNode & { presence?: unknown }).presence = {
    user: "do-not-send",
  }

  const endpointNode = node("endpoint-create-invoice", "Create Invoice", {
    semanticType: "endpoint",
    method: "POST",
    path: "/invoices",
    authRequired: true,
    idempotent: true,
    subcanvasRef: {
      graphId: nestedGraphId,
      scopeKind: "architecture-layer",
      title: "Create Invoice Internals",
    },
  })
  const entityNode = node("entity-invoice", "Invoice", {
    semanticType: "entity",
    fields: ["id", "tenantId", "total", "status"],
    tenantKey: "tenantId",
  })
  const childDoc = createCanvasDocV1(
    {
      nodes: [endpointNode, entityNode],
      edges: [
        edge("edge-endpoint-entity", endpointNode.id, entityNode.id, "db-write", [
          "persists invoice",
        ]),
      ],
    },
    {
      projectId,
      graphId: childGraphId,
      parentGraphId: ROOT_GRAPH_ID,
      parentNodeId: serviceNode.id,
      scopeKind: "service-internal",
      title: "Billing Service",
      layer: 1,
      layerKind: "service-internals",
    }
  )
  const nestedDoc = createCanvasDocV1(
    {
      nodes: [
        node("rule-idempotency", "Idempotency Rule", {
          semanticType: "business-rule",
          ruleType: "idempotency",
        }),
      ],
      edges: [],
    },
    {
      projectId,
      graphId: nestedGraphId,
      parentGraphId: childGraphId,
      parentNodeId: endpointNode.id,
      scopeKind: "architecture-layer",
      title: "Create Invoice Internals",
      layer: 2,
      layerKind: "endpoint-internals",
    }
  )

  const transportOnly = buildCanvasPyramidFromDocs(projectId, [
    rootDoc,
    childDoc,
    nestedDoc,
  ])
  const transportJson = JSON.stringify(transportOnly)
  assert(transportOnly.graphs.length === 3, "Canvas pyramid did not include nested graphs")
  assert(!transportJson.includes("selected"), "selected leaked into LLM transport")
  assert(!transportJson.includes("dragging"), "dragging leaked into LLM transport")
  assert(!transportJson.includes("presence"), "presence leaked into LLM transport")
  assert(
    !transportJson.includes("sk-abcdefghijklmnopqrstuvwxyz123456"),
    "raw secret leaked into LLM transport"
  )
  assert(transportJson.includes("[redacted-secret]"), "raw secret was not redacted")
  assert(
    transportJson.includes("secretRef:database/connection-string"),
    "secretRef did not survive LLM transport"
  )
  assert(
    transportJson.includes("secretCapabilityRef:llm/provider"),
    "secretCapabilityRef did not survive LLM transport"
  )
  assert(
    transportJson.includes("llm-agent-orchestrator") &&
      transportJson.includes("agent-tool-call"),
    "custom architecture types did not survive LLM transport"
  )

  assert(
    JSON.stringify(LLM_PROMPT_PACK_TARGET_AGENTS) ===
      JSON.stringify(["codex", "claude-code", "generic-ai-builder"]),
    "Prompt Pack target agents changed"
  )
  const retiredTargetName = ["nim", "bus"].join("")
  assert(
    !JSON.stringify(LLM_PROMPT_PACK_TARGET_AGENTS).toLowerCase().includes(retiredTargetName),
    "Retired target became an active Prompt Pack target"
  )

  const provider = new MockAiProvider()
  const proposal = await provider.generatePromptPack({
    projectId,
    projectName: "Prompt Pack Smoke",
    targetAgent: "codex",
    scopeMode: "full-project",
    currentGraphId: ROOT_GRAPH_ID,
    selectedNodeIds: [],
    instructions: "Keep the report concise.",
    canvasPyramid: transportOnly,
  })
  const proposalJson = JSON.stringify(proposal)
  assert(proposal.globalPrompt.markdown.length > 0, "missing global prompt")
  assert(proposal.layerPrompts.length === 3, "mock provider did not return layer prompts")
  assert(
    proposal.nodePrompts.some((prompt) => prompt.nodeId === serviceNode.id),
    "mock provider did not return node prompts from actual canvas nodes"
  )
  assert(
    proposal.nodePrompts.some((prompt) => prompt.nodeId === endpointNode.id),
    "mock provider did not use nested layer nodes"
  )
  assert(!proposalJson.toLowerCase().includes(retiredTargetName), "Prompt Pack mentioned retired target")
  assert(!proposalJson.includes("```"), "mock Prompt Pack generated code fences")
  assert(
    !proposalJson.includes("sk-abcdefghijklmnopqrstuvwxyz123456"),
    "Prompt Pack leaked raw secret"
  )

  const freeform = structuredClone(proposal)
  freeform.globalPrompt.markdown = "Freeform markdown with unusual wording is allowed.\n\n- Keep context."
  parseLlmPromptPackProposal(freeform)

  const unsafe = structuredClone(proposal)
  unsafe.globalPrompt.markdown = "leak sk-abcdefghijklmnopqrstuvwxyz123456"
  let rejectedUnsafe = false
  try {
    parseLlmPromptPackProposal(unsafe)
  } catch {
    rejectedUnsafe = true
  }
  assert(rejectedUnsafe, "raw secret Prompt Pack output was not rejected")

  const patchProposal = {
    summary: "Preview all supported non-destructive patch operations.",
    operations: [
      {
        op: "update-node",
        graphId: ROOT_GRAPH_ID,
        nodeId: serviceNode.id,
        patch: { description: "Billing service owns invoice lifecycle." },
      },
      {
        op: "add-node",
        graphId: ROOT_GRAPH_ID,
        tempId: "policy-temp",
        node: {
          label: "Invoice Policy",
          semanticType: "policy",
          description: "Guards invoice ownership.",
          position: { x: 480, y: 260 },
          metadata: { policyKind: "security" },
        },
      },
      {
        op: "add-edge",
        graphId: ROOT_GRAPH_ID,
        tempId: "policy-edge-temp",
        edge: {
          source: "policy-temp",
          target: serviceNode.id,
          semanticType: "guards",
          label: "guards billing",
          metadata: {},
        },
      },
      {
        op: "create-layer",
        parentGraphId: ROOT_GRAPH_ID,
        parentNodeId: customNode.id,
        graph: {
          title: "AI Orchestrator Internals",
          layerKind: "custom-ai-layer",
          summary: "LLM orchestration internals.",
          nodes: [
            {
              id: "tool-router",
              label: "Tool Router",
              semanticType: "custom-router",
              metadata: { architectureType: "llm-tool-router" },
            },
          ],
          edges: [],
        },
      },
      {
        op: "delete-node",
        graphId: ROOT_GRAPH_ID,
        nodeId: databaseNode.id,
      },
      {
        op: "update-node",
        graphId: ROOT_GRAPH_ID,
        nodeId: "missing-node",
        patch: { description: "missing" },
      },
    ],
  }
  parseLlmPromptPackProposal({
    ...proposal,
    canvasImprovementProposal: patchProposal,
  })

  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.user.create({
    data: {
      id: userId,
      email: "prompt-pack-smoke@example.test",
      name: "Prompt Pack Smoke",
    },
  })
  await prisma.project.create({
    data: {
      id: projectId,
      ownerId: userId,
      name: "Prompt Pack Smoke",
    },
  })

  await writeCanvasDoc(projectId, rootDoc, {
    graphId: ROOT_GRAPH_ID,
    scopeKind: "system-root",
    title: "Prompt Pack Smoke",
  })
  await writeCanvasDoc(projectId, childDoc, {
    graphId: childGraphId,
    parentGraphId: ROOT_GRAPH_ID,
    parentNodeId: serviceNode.id,
    scopeKind: "service-internal",
    title: "Billing Service",
    layer: 1,
    layerKind: "service-internals",
  })
  await writeCanvasDoc(projectId, nestedDoc, {
    graphId: nestedGraphId,
    parentGraphId: childGraphId,
    parentNodeId: endpointNode.id,
    scopeKind: "architecture-layer",
    title: "Create Invoice Internals",
    layer: 2,
    layerKind: "endpoint-internals",
  })

  const loadedPyramid = await loadProjectCanvasPyramid(projectId)
  assert(
    loadedPyramid.graphs.map((graph) => graph.graphId).includes(nestedGraphId),
    "loadProjectCanvasPyramid did not load nested child graph"
  )

  const applyResult = await applyLlmCanvasImprovementProposal({
    projectId,
    currentGraphId: ROOT_GRAPH_ID,
    proposal: patchProposal,
  })
  assert(applyResult.applied.updateNodes === 1, "update-node was not applied")
  assert(applyResult.applied.addNodes === 1, "add-node was not applied")
  assert(applyResult.applied.addEdges === 1, "add-edge was not applied")
  assert(applyResult.applied.createLayers === 1, "create-layer was not applied")
  assert(
    applyResult.applied.skippedOperations === 2,
    "unsupported/missing patch operations were not skipped explicitly"
  )
  assert(
    applyResult.issues.some((item) => item.message.includes("Unsupported patch operation")),
    "unsupported delete operation did not return an explicit issue"
  )
  assert(
    applyResult.issues.some((item) => item.message.includes("missing node")),
    "missing node reference did not return an explicit issue"
  )

  const panelSource = await readFile(
    path.join(process.cwd(), "components/editor/prompt-pack-panel.tsx"),
    "utf8"
  )
  assert(panelSource.includes("/api/ai/prompt-pack"), "Prompt Pack UI does not use AI task route")
  const removedProjectRouteFetch = [
    "/api/projects/",
    "${projectId}",
    "/prompt-",
    "pack?",
  ].join("")
  const removedDesignIrCompilerName = [
    "compile",
    "DesignIr",
    "To",
    "Prompt",
    "Pack",
  ].join("")
  assert(!panelSource.includes(removedProjectRouteFetch), "Prompt Pack UI still calls the old project route")
  assert(!panelSource.includes(removedDesignIrCompilerName), "Prompt Pack UI still calls the old compiler")
  assert(
    panelSource.includes("Apply canvas improvements"),
    "Prompt Pack UI does not expose user-approved canvas improvement apply"
  )

  const oldRoutePath = path.join(
    process.cwd(),
    "app",
    "api",
    "projects",
    "[projectId]",
    "prompt-pack",
    "route.ts"
  )
  const oldCompilerPath = path.join(process.cwd(), "lib", "prompt-pack", "prompt-pack.ts")
  const oldProjectCompilerPath = path.join(
    process.cwd(),
    "lib",
    "prompt-pack",
    ["prompt", "pack", "project"].join("-") + ".ts"
  )
  assert(!(await pathExists(oldRoutePath)), "Old project Prompt Pack route still exists")
  assert(!(await pathExists(oldCompilerPath)), "Old Prompt Pack compiler module still exists")
  assert(!(await pathExists(oldProjectCompilerPath)), "Old project Prompt Pack compiler module still exists")

  const promptPackHandlerSource = await readFile(
    path.join(process.cwd(), "lib/ai-tasks/task-handlers/prompt-pack-handler.ts"),
    "utf8"
  )
  assert(
    promptPackHandlerSource.includes("loadProjectCanvasPyramid") &&
      promptPackHandlerSource.includes("generatePromptPack"),
    "LLM Prompt Pack task no longer uses CanvasDoc pyramid provider flow"
  )

  const designIrPanelSource = await readFile(
    path.join(process.cwd(), "components/editor/design-ir-panel.tsx"),
    "utf8"
  )
  assert(designIrPanelSource.includes("Design IR"), "Design IR panel no longer opens")

  const aiSidebarSource = await readFile(
    path.join(process.cwd(), "components/editor/ai-sidebar.tsx"),
    "utf8"
  )
  assert(
    aiSidebarSource.includes("/api/ai/architect") &&
      aiSidebarSource.includes("Open Prompt Pack"),
    "Architect conversation or Prompt Pack handoff is not reachable from AI sidebar"
  )
  const legacyAiDesignRoute = ["", "api", "ai", "design"].join("/")
  assert(
    !aiSidebarSource.includes(legacyAiDesignRoute),
    "AI sidebar still calls the legacy design route"
  )
  const semanticInspectorSource = await readFile(
    path.join(process.cwd(), "components/editor/canvas/semantic-inspector.tsx"),
    "utf8"
  )
  assert(
    semanticInspectorSource.includes("Open design layer") &&
      semanticInspectorSource.includes("Create layer"),
    "Generic layer drill-down affordance is missing"
  )

  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await rm(root, { recursive: true, force: true })
  await prisma.$disconnect()
  console.log("prompt pack smoke passed")
}

main().catch(async (error: unknown) => {
  console.error(error)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
