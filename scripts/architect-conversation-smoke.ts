import { access, mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { CanvasEdge, CanvasNode } from "@/types/canvas"
import { SHAPE_DEFAULTS } from "@/types/canvas"
import { MockAiProvider } from "@/lib/ai/providers/mock-provider"
import { getSafeAiProviderMetadata } from "@/lib/ai/providers/provider-factory"
import { runArchitectConversationTask } from "@/lib/ai-tasks/task-handlers/architect-conversation-handler"
import {
  createArchitectConversationMessage,
  deleteArchitectConversationMessages,
  listArchitectConversationMessages,
} from "@/lib/ai/architect/architect-conversation-store"
import {
  buildArchitectUserPrompt,
  parseArchitectConversationReply,
} from "@/lib/ai/architect/architect-provider-contract"
import { createCanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { loadProjectCanvasPyramid } from "@/lib/canvas/canvas-pyramid"
import { applyLlmCanvasImprovementProposal } from "@/lib/canvas/llm-canvas-patch"
import { readCanvasDoc, writeCanvasDoc } from "@/lib/canvas/canvas-persistence"
import { baseNodeData } from "@/lib/canvas/semantic-defaults"
import { ROOT_GRAPH_ID } from "@/lib/canvas/graph-ids"
import { prisma } from "@/lib/prisma"

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
    data: {
      ...baseNodeData(label),
      ...data,
      apiKey: "sk-abcdefghijklmnopqrstuvwxyz123456",
    },
    width: SHAPE_DEFAULTS.rectangle.width,
    height: SHAPE_DEFAULTS.rectangle.height,
  }
}

function edge(id: string, source: string, target: string): CanvasEdge {
  return {
    id,
    type: "canvasEdge",
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
    selected: true,
    data: {
      semanticType: "db-write",
      label: "writes",
      labels: ["writes"],
    },
  }
}

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), "arc-forge-architect-smoke-"))
  process.env.AI_PROVIDER = "mock"
  process.env.STORAGE_PROVIDER = "local_fs"
  process.env.LOCAL_STORAGE_ROOT = root

  const projectId = "project-architect-conversation-smoke"
  const userId = "user-architect-conversation-smoke"
  const serviceNode = node("service-billing", "Billing Service", {
    semanticType: "service",
    serviceKind: "application-service",
    runtime: "node-typescript",
    framework: "nextjs-api",
    tenancy: "owner-scoped-now-workspace-compatible-later",
    authMode: "internal-cookie-session",
    secretRef: "secretRef:billing/api-key",
  })
  const databaseNode = node("database-ledger", "Ledger Database", {
    semanticType: "database",
    dbKind: "relational",
    engine: "postgresql",
    orm: "prisma",
  })
  const customNode = node("custom-orchestrator", "AI Orchestrator", {
    semanticType: "unclassified",
    llmSemanticType: "ai-agent-orchestrator",
    architectureType: "custom-agent-orchestrator",
    secretCapabilityRef: "secretCapabilityRef:llm/provider",
  })
  const doc = createCanvasDocV1(
    {
      nodes: [serviceNode, databaseNode, customNode],
      edges: [
        edge("edge-billing-ledger", serviceNode.id, databaseNode.id),
        {
          ...edge("edge-service-orchestrator", serviceNode.id, customNode.id),
          data: {
            semanticType: "unclassified",
            llmSemanticType: "custom-ai-call",
            architectureType: "custom-agent-link",
            label: "asks AI",
            labels: ["asks AI"],
          },
        },
      ],
    },
    {
      projectId,
      graphId: ROOT_GRAPH_ID,
      scopeKind: "system-root",
      title: "Architect Conversation Smoke",
    }
  )

  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.user.create({
    data: {
      id: userId,
      email: "architect-conversation-smoke@example.test",
      name: "Architect Conversation Smoke",
    },
  })
  await prisma.project.create({
    data: {
      id: projectId,
      ownerId: userId,
      name: "Architect Conversation Smoke",
    },
  })
  await writeCanvasDoc(projectId, doc, {
    graphId: ROOT_GRAPH_ID,
    scopeKind: "system-root",
    title: "Architect Conversation Smoke",
  })

  const pyramid = await loadProjectCanvasPyramid(projectId)
  const pyramidJson = JSON.stringify(pyramid)
  assert(pyramid.graphs.length === 1, "Architect pyramid should load the root graph")
  assert(!pyramidJson.includes("selected"), "selected leaked into Architect transport")
  assert(!pyramidJson.includes("dragging"), "dragging leaked into Architect transport")
  assert(
    !pyramidJson.includes("sk-abcdefghijklmnopqrstuvwxyz123456"),
    "raw secret leaked into Architect transport"
  )
  assert(
    pyramidJson.includes("secretRef:billing/api-key"),
    "secretRef did not survive Architect transport"
  )
  assert(
    pyramidJson.includes("secretCapabilityRef:llm/provider"),
    "secretCapabilityRef did not survive Architect transport"
  )
  assert(
    pyramidJson.includes("ai-agent-orchestrator") &&
      pyramidJson.includes("custom-agent-link"),
    "custom node/edge types did not survive Architect transport"
  )

  const provider = new MockAiProvider()
  const providerMetadata = getSafeAiProviderMetadata(provider.name)
  assert(providerMetadata.providerName === "mock", "mock provider metadata missing name")
  assert(providerMetadata.isMockProvider, "mock provider metadata missing mock flag")

  const providerPrompt = buildArchitectUserPrompt({
    projectId,
    projectName: "Architect Conversation Smoke",
    currentGraphId: ROOT_GRAPH_ID,
    userId,
    providerName: providerMetadata.providerName,
    isMockProvider: providerMetadata.isMockProvider,
    userMessage: "Are you a real LLM?",
    selectedNodeIds: [],
    recentMessages: [],
    canvasPyramid: pyramid,
  })
  assert(providerPrompt.includes('"providerName": "mock"'), "provider name missing from Architect prompt")
  assert(providerPrompt.includes('"isMockProvider": true'), "mock flag missing from Architect prompt")
  assert(
    providerPrompt.includes("include starter internal graph.nodes"),
    "Architect prompt does not discourage blank create-layer proposals"
  )

  const reply = await provider.generateArchitectReply({
    projectId,
    projectName: "Architect Conversation Smoke",
    currentGraphId: ROOT_GRAPH_ID,
    userId,
    providerName: providerMetadata.providerName,
    isMockProvider: providerMetadata.isMockProvider,
    userMessage: "Improve the selected node responsibilities",
    selectedNodeIds: [serviceNode.id],
    recentMessages: [],
    canvasPyramid: pyramid,
  })
  parseArchitectConversationReply(reply)
  assert(reply.assistantMessage.content.length > 0, "Architect reply is empty")
  assert(
    (reply.canvasPatchProposal?.operations.length ?? 0) > 0,
    "Architect did not return a user-approved patch proposal"
  )
  const clarificationReply = await provider.generateArchitectReply({
    projectId,
    projectName: "Architect Conversation Smoke",
    currentGraphId: ROOT_GRAPH_ID,
    userId,
    providerName: providerMetadata.providerName,
    isMockProvider: providerMetadata.isMockProvider,
    userMessage: "Ask clarification questions before changing the canvas",
    selectedNodeIds: [],
    recentMessages: [],
    canvasPyramid: pyramid,
  })
  assert(
    clarificationReply.clarificationQuestions.length > 0,
    "Architect cannot return clarification questions"
  )
  const identityReply = await provider.generateArchitectReply({
    projectId,
    projectName: "Architect Conversation Smoke",
    currentGraphId: ROOT_GRAPH_ID,
    userId,
    providerName: providerMetadata.providerName,
    isMockProvider: providerMetadata.isMockProvider,
    userMessage: "Are you a real LLM?",
    selectedNodeIds: [],
    recentMessages: [],
    canvasPyramid: pyramid,
  })
  assert(
    /mock provider|fixture/i.test(identityReply.assistantMessage.content),
    "mock Architect identity answer did not disclose mock fixture mode"
  )
  assert(
    !identityReply.promptPackHandoff.recommended,
    "mock identity answer should not recommend Prompt Pack"
  )

  await createArchitectConversationMessage({
    projectId,
    graphId: ROOT_GRAPH_ID,
    userId,
    role: "user",
    content: "Improve the selected node responsibilities",
    linkedRunId: "architect-smoke-run",
    metadata: { selected: true, selectedNodeIds: [serviceNode.id] },
  })
  const result = await runArchitectConversationTask(
    {
      projectId,
      projectName: "Architect Conversation Smoke",
      graphId: ROOT_GRAPH_ID,
      userId,
      userMessage: "Improve the selected node responsibilities",
      selectedNodeIds: [serviceNode.id],
    },
    "architect-smoke-run"
  )
  assert(result.reply.assistantMessage.content.length > 0, "handler reply is empty")
  assert(
    result.summary.canvasPatchOperationCount &&
      result.summary.canvasPatchOperationCount > 0,
    "handler summary did not report patch operations"
  )
  assert(result.summary.providerName === "mock", "handler summary missed provider name")
  assert(result.summary.isMockProvider, "handler summary missed mock provider flag")
  assert(result.provider.providerName === "mock", "handler output missed provider metadata")
  const messages = await listArchitectConversationMessages({
    projectId,
    graphId: ROOT_GRAPH_ID,
  })
  assert(messages.length === 2, "conversation messages were not persisted")
  assert(messages[0].role === "user", "user message was not stored first")
  assert(messages[1].role === "assistant", "assistant message was not stored")
  assert(
    !JSON.stringify(messages).includes('"selected":true'),
    "transient metadata leaked into conversation persistence"
  )

  const applyResult = await applyLlmCanvasImprovementProposal({
    projectId,
    currentGraphId: ROOT_GRAPH_ID,
    proposal: result.reply.canvasPatchProposal,
  })
  assert(applyResult.applied.updateNodes === 1, "Architect patch did not update node")
  const written = await readCanvasDoc(projectId, ROOT_GRAPH_ID)
  const updatedNode = written?.nodes.find((item) => item.id === serviceNode.id)
  assert(updatedNode, "updated node was not persisted")
  assert(
    updatedNode.data.status === "approved",
    "Architect patch did not persist node status"
  )
  assert(!JSON.stringify(written).includes("dragging"), "dragging persisted after apply")
  assert(!JSON.stringify(written).includes("selected"), "selected persisted after apply")

  const skippedDelete = await applyLlmCanvasImprovementProposal({
    projectId,
    currentGraphId: ROOT_GRAPH_ID,
    proposal: {
      summary: "Unsupported destructive operation should be skipped.",
      operations: [
        {
          op: "delete-node",
          graphId: ROOT_GRAPH_ID,
          nodeId: databaseNode.id,
        },
      ],
    },
  })
  assert(
    skippedDelete.applied.skippedOperations === 1,
    "unsupported delete operation was not skipped"
  )
  assert(
    skippedDelete.issues.some((issue) => issue.message.includes("Unsupported patch operation")),
    "unsupported delete operation did not return an explicit issue"
  )

  const existingLayerGraphId = "graph_architect_existing_layer_smoke"
  const rootBeforeExistingLayerApply = await readCanvasDoc(projectId, ROOT_GRAPH_ID)
  assert(rootBeforeExistingLayerApply, "root graph missing before existing layer smoke")
  await writeCanvasDoc(
    projectId,
    {
      ...rootBeforeExistingLayerApply,
      nodes: rootBeforeExistingLayerApply.nodes.map((item) =>
        item.id === customNode.id
          ? {
              ...item,
              data: {
                ...item.data,
                subcanvasRef: {
                  graphId: existingLayerGraphId,
                  scopeKind: "architecture-layer",
                  title: "AI Orchestrator Internals",
                },
              },
            }
          : item
      ),
    },
    {
      graphId: ROOT_GRAPH_ID,
      scopeKind: "system-root",
      title: "Architect Conversation Smoke",
    }
  )
  await writeCanvasDoc(
    projectId,
    createCanvasDocV1(
      { nodes: [], edges: [] },
      {
        projectId,
        graphId: existingLayerGraphId,
        parentGraphId: ROOT_GRAPH_ID,
        parentNodeId: customNode.id,
        scopeKind: "architecture-layer",
        title: "AI Orchestrator Internals",
        layer: 1,
        layerKind: "custom-ai-layer",
      }
    ),
    {
      graphId: existingLayerGraphId,
      parentGraphId: ROOT_GRAPH_ID,
      parentNodeId: customNode.id,
      scopeKind: "architecture-layer",
      title: "AI Orchestrator Internals",
      layer: 1,
      layerKind: "custom-ai-layer",
    }
  )
  const existingLayerApply = await applyLlmCanvasImprovementProposal({
    projectId,
    currentGraphId: ROOT_GRAPH_ID,
    proposal: {
      summary: "Populate an existing drill-down layer.",
      operations: [
        {
          op: "create-layer",
          parentGraphId: ROOT_GRAPH_ID,
          parentNodeId: customNode.id,
          graph: {
            title: "AI Orchestrator Internals",
            layerKind: "custom-ai-layer",
            summary: "Reuse the existing child layer and add starter internals.",
            nodes: [
              {
                id: "routing-policy",
                label: "Routing Policy",
                semanticType: "policy",
                description: "Chooses which model/tool path handles each request.",
              },
            ],
            edges: [],
          },
        },
      ],
    },
  })
  assert(
    existingLayerApply.applied.createLayers === 1,
    "existing create-layer was not applied"
  )
  assert(
    existingLayerApply.applied.skippedOperations === 0,
    "existing create-layer should not be skipped"
  )
  const existingLayerDoc = await readCanvasDoc(projectId, existingLayerGraphId)
  assert(
    existingLayerDoc?.nodes.some((item) => item.id === "routing-policy"),
    "existing child layer did not receive proposed nodes"
  )
  const rootAfterExistingLayerApply = await readCanvasDoc(projectId, ROOT_GRAPH_ID)
  const customNodeAfterExistingLayerApply = rootAfterExistingLayerApply?.nodes.find(
    (item) => item.id === customNode.id
  )
  assert(
    customNodeAfterExistingLayerApply?.data.subcanvasRef?.graphId === existingLayerGraphId,
    "existing child layer reference was not preserved"
  )

  const childGraphId = "graph_architect_child_smoke"
  await createArchitectConversationMessage({
    projectId,
    graphId: childGraphId,
    userId,
    role: "user",
    content: "Keep this child layer thread",
  })
  await createArchitectConversationMessage({
    projectId,
    graphId: childGraphId,
    userId,
    role: "assistant",
    content: "Child layer Architect reply",
  })
  await prisma.realtimeRoomEvent.create({
    data: {
      projectId,
      roomId: `${projectId}:${ROOT_GRAPH_ID}`,
      userId,
      type: "event.broadcast",
      payloadJson: {
        type: "chat.message",
        payload: {
          sender: "Smoke",
          role: "user",
          content: "Chat must survive Architect reset",
          timestamp: new Date().toISOString(),
        },
      },
    },
  })
  const realtimeEventsBeforeClear = await prisma.realtimeRoomEvent.count({
    where: { projectId },
  })
  const deletedMessages = await deleteArchitectConversationMessages({
    projectId,
    graphId: ROOT_GRAPH_ID,
  })
  assert(deletedMessages === 2, "Architect reset deleted the wrong root message count")
  const rootMessagesAfterClear = await listArchitectConversationMessages({
    projectId,
    graphId: ROOT_GRAPH_ID,
  })
  assert(rootMessagesAfterClear.length === 0, "Architect reset left root messages behind")
  const childMessagesAfterClear = await listArchitectConversationMessages({
    projectId,
    graphId: childGraphId,
  })
  assert(
    childMessagesAfterClear.length === 2,
    "Architect reset deleted another graph's messages"
  )
  const realtimeEventsAfterClear = await prisma.realtimeRoomEvent.count({
    where: { projectId },
  })
  assert(
    realtimeEventsAfterClear === realtimeEventsBeforeClear,
    "Architect reset deleted realtime chat events"
  )
  const canvasAfterClear = await readCanvasDoc(projectId, ROOT_GRAPH_ID)
  assert(
    canvasAfterClear?.nodes.some((item) => item.id === serviceNode.id),
    "Architect reset changed the canvas"
  )

  const legacyAiRouteSegments = ["app", "api", "ai", "design", "route.ts"]
  const oldAiDesignRoute = path.join(process.cwd(), ...legacyAiRouteSegments)
  assert(!(await pathExists(oldAiDesignRoute)), "legacy AI design route exists")

  const providerTypes = await readFile(
    path.join(process.cwd(), "lib", "ai", "providers", "types.ts"),
    "utf8"
  )
  assert(providerTypes.includes("generateArchitectReply"), "provider contract lacks Architect")
  const legacyDesignMethod = ["generate", "Design", "Actions"].join("")
  assert(!providerTypes.includes(legacyDesignMethod), "legacy design action provider returned")

  const aiTaskModel = await readFile(
    path.join(process.cwd(), "prisma", "models", "ai_task.prisma"),
    "utf8"
  )
  assert(aiTaskModel.includes("architect_conversation"), "Architect task type is missing")
  const legacyTaskType = ["design", "agent"].join("_")
  assert(!aiTaskModel.includes(legacyTaskType), "legacy design task type returned")

  const sidebarSource = await readFile(
    path.join(process.cwd(), "components", "editor", "ai-sidebar.tsx"),
    "utf8"
  )
  assert(
    sidebarSource.includes("/api/ai/architect"),
    "Architect UI does not call the conversation route"
  )
  assert(
    sidebarSource.includes("/architect/canvas-patch/apply"),
    "Architect UI does not expose patch apply"
  )
  assert(
    sidebarSource.includes("Mock provider — fixture replies") &&
      sidebarSource.includes("Real LLM provider"),
    "Architect UI does not show provider mode"
  )
  assert(
    sidebarSource.includes("Clear Architect conversation for this layer? Canvas will not be changed.") &&
      sidebarSource.includes('method: "DELETE"'),
    "Architect UI does not expose safe conversation reset"
  )
  assert(
    sidebarSource.includes("Architect connection dropped. Reconnect and try again."),
    "Architect UI does not show the concise connection error"
  )
  assert(
    sidebarSource.includes("Realtime disconnected — canvas may not be fully synced."),
    "Architect UI does not show the realtime warning copy"
  )
  assert(
    sidebarSource.includes("StreamingArchitectMessageContent") &&
      sidebarSource.includes("ArchitectReplyDetails"),
    "Architect UI message rendering is missing chat-quality affordances"
  )
  assert(
    sidebarSource.includes("collaboratorChatMessages") &&
      sidebarSource.includes('msg.role === "user"'),
    "Chat tab is not collaborator-only"
  )
  assert(
    sidebarSource.includes("Architect") &&
      sidebarSource.includes("Chat") &&
      sidebarSource.includes("Specs") &&
      !sidebarSource.includes("Design</TabsTrigger>"),
    "AI sidebar tabs are not Architect/Chat/Specs only"
  )
  assert(
    !sidebarSource.includes(["", "api", "ai", "design"].join("/")),
    "Architect UI calls the legacy design route"
  )
  const architectConversationRoute = await readFile(
    path.join(
      process.cwd(),
      "app",
      "api",
      "projects",
      "[projectId]",
      "architect",
      "conversation",
      "route.ts"
    ),
    "utf8"
  )
  assert(
    architectConversationRoute.includes("export async function DELETE") &&
      architectConversationRoute.includes("deleteArchitectConversationMessages"),
    "Architect conversation route does not expose graph-scoped DELETE"
  )
  assert(
    architectConversationRoute.includes("getAccessibleProject") &&
      architectConversationRoute.includes("getCurrentProjectIdentity"),
    "Architect conversation DELETE route does not enforce project access"
  )

  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await rm(root, { recursive: true, force: true })
  await prisma.$disconnect()
  console.log("architect conversation smoke passed")
}

main().catch(async (error: unknown) => {
  console.error(error)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
