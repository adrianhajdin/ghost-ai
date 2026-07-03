import { ROOT_GRAPH_ID } from "@/lib/canvas/graph-ids"
import { getAiProvider, getAiProviderName } from "@/lib/ai/providers/provider-factory"
import type { CanvasEdge, CanvasNode } from "@/types/canvas"

const trackedEnv = [
  "AI_PROVIDER",
  "AI_API_KEY",
  "AI_BASE_URL",
  "AI_MODEL",
  "AI_SPEC_MODEL",
  "GOOGLE_AI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_AI_MODEL",
  "GOOGLE_AI_SPEC_MODEL",
] as const

const originalEnv = Object.fromEntries(
  trackedEnv.map((key) => [key, process.env[key]])
) as Record<(typeof trackedEnv)[number], string | undefined>

function resetEnv() {
  for (const key of trackedEnv) {
    const original = originalEnv[key]
    if (original === undefined) delete process.env[key]
    else process.env[key] = original
  }
}

function clearAiEnv() {
  for (const key of trackedEnv) {
    delete process.env[key]
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function expectThrows(fn: () => unknown, messageIncludes: string) {
  try {
    fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    assert(
      message.includes(messageIncludes),
      `Expected error to include "${messageIncludes}", got "${message}"`
    )
    return
  }

  throw new Error(`Expected function to throw "${messageIncludes}"`)
}

const legacyDesignMethodName = ["generate", "Design", "Actions"].join("")

const smokeNodes = [
  {
    id: "billing-service",
    type: "canvasNode",
    position: { x: 80, y: 80 },
    data: {
      label: "Billing Service",
      name: "Billing Service",
      semanticType: "service",
      status: "draft",
      shape: "pill",
      color: "#10233D",
      textColor: "#52A8FF",
      runtime: "node-typescript",
      framework: "nextjs-api",
    },
  },
  {
    id: "billing-database",
    type: "canvasNode",
    position: { x: 340, y: 80 },
    data: {
      label: "Billing Database",
      name: "Billing Database",
      semanticType: "database",
      status: "draft",
      shape: "cylinder",
      color: "#062822",
      textColor: "#0AC7B4",
      engine: "postgresql",
      orm: "prisma",
    },
  },
] satisfies CanvasNode[]

const smokeEdges = [
  {
    id: "edge-billing-db",
    type: "canvasEdge",
    source: "billing-service",
    target: "billing-database",
    sourceHandle: null,
    targetHandle: null,
    data: {
      semanticType: "db-write",
      label: "persists invoices",
      labels: ["persists invoices"],
    },
  },
] satisfies CanvasEdge[]

async function main() {
  clearAiEnv()
  assert(getAiProviderName() === "mock", "AI_PROVIDER should default to mock")

  process.env.AI_PROVIDER = "mock"
  const mockProvider = getAiProvider()
  assert(mockProvider.name === "mock", "mock provider was not selected")
  assert(
    !(legacyDesignMethodName in (mockProvider as object)),
    "mock provider must not expose the legacy design action method"
  )
  assert(
    typeof mockProvider.generateArchitectReply === "function",
    "mock provider should expose the Architect conversation method"
  )

  const draft = await mockProvider.generateArchitectureDraft({
    prompt: "Design an event-driven billing platform",
    projectId: "project-ai-provider-smoke",
    graphId: ROOT_GRAPH_ID,
    complexity: "standard",
    currentCanvasSummary: {
      graphId: ROOT_GRAPH_ID,
      title: "System",
      parentGraphId: null,
      parentNodeId: null,
      layer: null,
      layerKind: null,
      summary: null,
      nodeCount: smokeNodes.length,
      edgeCount: smokeEdges.length,
      nodeTypes: { service: 1, database: 1 },
      edgeTypes: { "db-write": 1 },
      nodes: smokeNodes.map((node) => ({
        id: node.id,
        label: node.data.label,
        name: node.data.name,
        semanticType: node.data.semanticType,
      })),
      edges: smokeEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        semanticType: edge.data?.semanticType,
        label: edge.data?.label,
      })),
    },
    rootCanvasSummary: null,
    graphHierarchySummary: null,
    existingDesignIr: null,
  })
  assert(draft.nodes.length >= 2, "mock architecture draft should include nodes")
  assert(draft.edges.length >= 1, "mock architecture draft should include edges")

  const markdown = await mockProvider.generateSpecMarkdown({
    projectId: "project-ai-provider-smoke",
    roomId: "project-ai-provider-smoke",
    chatHistory: [{ role: "user", content: "Generate a billing platform spec" }],
    nodes: smokeNodes,
    edges: smokeEdges,
  })
  assert(markdown.startsWith("#"), "mock spec should return Markdown")

  const promptPack = await mockProvider.generatePromptPack({
    projectId: "project-ai-provider-smoke",
    projectName: "AI Provider Smoke",
    targetAgent: "codex",
    scopeMode: "full-project",
    currentGraphId: ROOT_GRAPH_ID,
    selectedNodeIds: [],
    canvasPyramid: {
      projectId: "project-ai-provider-smoke",
      rootGraphId: ROOT_GRAPH_ID,
      graphs: [
        {
          graphId: ROOT_GRAPH_ID,
          title: "System",
          scopeKind: "system-root",
          parentGraphId: null,
          parentNodeId: null,
          layer: null,
          layerKind: null,
          summary: null,
          nodes: smokeNodes.map((node) => ({
            id: node.id,
            type: node.type,
            position: node.position,
            data: node.data,
          })),
          edges: smokeEdges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            type: edge.type,
            data: edge.data ?? {},
          })),
        },
      ],
      graphIndex: [
        {
          graphId: ROOT_GRAPH_ID,
          title: "System",
          parentGraphId: null,
          parentNodeId: null,
          layer: null,
          layerKind: null,
          nodeCount: smokeNodes.length,
          edgeCount: smokeEdges.length,
        },
      ],
    },
  })
  assert(promptPack.globalPrompt.markdown.length > 0, "mock Prompt Pack should return a global prompt")
  assert(promptPack.layerPrompts.length === 1, "mock Prompt Pack should return a layer prompt")
  assert(promptPack.nodePrompts.length >= 1, "mock Prompt Pack should return node prompts")

  const architectReply = await mockProvider.generateArchitectReply({
    projectId: "project-ai-provider-smoke",
    projectName: "AI Provider Smoke",
    currentGraphId: ROOT_GRAPH_ID,
    userId: "user-ai-provider-smoke",
    userMessage: "Improve the selected node responsibilities",
    selectedNodeIds: ["billing-service"],
    recentMessages: [
      {
        role: "user",
        content: "Can you review billing?",
        createdAt: new Date().toISOString(),
      },
    ],
    canvasPyramid: {
      projectId: "project-ai-provider-smoke",
      rootGraphId: ROOT_GRAPH_ID,
      graphs: [
        {
          graphId: ROOT_GRAPH_ID,
          title: "System",
          scopeKind: "system-root",
          parentGraphId: null,
          parentNodeId: null,
          layer: null,
          layerKind: null,
          summary: null,
          nodes: smokeNodes.map((node) => ({
            id: node.id,
            type: node.type,
            position: node.position,
            data: node.data,
          })),
          edges: smokeEdges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            type: edge.type,
            data: edge.data ?? {},
          })),
        },
      ],
      graphIndex: [
        {
          graphId: ROOT_GRAPH_ID,
          title: "System",
          parentGraphId: null,
          parentNodeId: null,
          layer: null,
          layerKind: null,
          nodeCount: smokeNodes.length,
          edgeCount: smokeEdges.length,
        },
      ],
    },
  })
  assert(
    architectReply.assistantMessage.content.length > 0,
    "mock Architect should return an assistant message"
  )
  assert(
    (architectReply.canvasPatchProposal?.operations.length ?? 0) > 0,
    "mock Architect should return a user-approved canvas patch proposal"
  )

  clearAiEnv()
  process.env.AI_PROVIDER = "unknown"
  expectThrows(() => getAiProvider(), "AI_PROVIDER")

  clearAiEnv()
  process.env.AI_PROVIDER = "google"
  expectThrows(() => getAiProvider(), "Missing Google AI API key")

  process.env.GOOGLE_AI_API_KEY = "test-key"
  const googleProvider = getAiProvider()
  assert(googleProvider.name === "google", "google provider was not selected after API key was set")
  assert(
    !(legacyDesignMethodName in (googleProvider as object)),
    "google provider must not expose the legacy design action method"
  )
  assert(
    typeof googleProvider.generateArchitectReply === "function",
    "google provider should expose the Architect conversation method"
  )

  clearAiEnv()
  process.env.AI_PROVIDER = "openai_compatible"
  expectThrows(() => getAiProvider(), "AI_API_KEY")

  process.env.AI_API_KEY = "test-key"
  expectThrows(() => getAiProvider(), "AI_BASE_URL")

  process.env.AI_BASE_URL = "https://example.test/v1"
  expectThrows(() => getAiProvider(), "AI_MODEL")

  process.env.AI_MODEL = "test-model"
  const openAiCompatibleProvider = getAiProvider()
  assert(
    openAiCompatibleProvider.name === "openai_compatible",
    "openai_compatible provider was not selected after required env was set"
  )
  assert(
    !(legacyDesignMethodName in (openAiCompatibleProvider as object)),
    "openai_compatible provider must not expose the legacy design action method"
  )
  assert(
    typeof openAiCompatibleProvider.generateArchitectReply === "function",
    "openai_compatible provider should expose the Architect conversation method"
  )

  console.log("ai provider smoke passed")
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exit(1)
  })
  .finally(() => {
    resetEnv()
  })
