import { applyDesignActions, DesignProviderResultSchema } from "@/lib/ai/design/design-actions"
import { emptyCanvasSnapshot } from "@/lib/canvas/canvas-state"
import { getAiProvider, getAiProviderName } from "@/lib/ai/providers/provider-factory"
import { ROOT_GRAPH_ID } from "@/lib/canvas/graph-ids"

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

async function main() {
  clearAiEnv()
  assert(getAiProviderName() === "mock", "AI_PROVIDER should default to mock")

  process.env.AI_PROVIDER = "mock"
  const mockProvider = getAiProvider()
  assert(mockProvider.name === "mock", "mock provider was not selected")

  const design = await mockProvider.generateDesignActions({
    prompt: "Design an event-driven billing platform",
    projectId: "project-ai-provider-smoke",
    roomId: "project-ai-provider-smoke",
    currentCanvas: emptyCanvasSnapshot(),
  })
  const parsedDesign = DesignProviderResultSchema.parse(design)
  const nodeAdds = parsedDesign.actions.filter((action) => action.type === "addNode")
  const edgeAdds = parsedDesign.actions.filter((action) => action.type === "addEdge")
  assert(nodeAdds.length >= 2, "mock design should add at least two nodes")
  assert(edgeAdds.length >= 1, "mock design should add at least one edge")

  const canvas = applyDesignActions(parsedDesign.actions, emptyCanvasSnapshot())
  assert(canvas.nodes.length >= 2, "validated design actions did not create nodes")
  assert(canvas.edges.length >= 1, "validated design actions did not create edges")

  const markdown = await mockProvider.generateSpecMarkdown({
    projectId: "project-ai-provider-smoke",
    roomId: "project-ai-provider-smoke",
    chatHistory: [{ role: "user", content: "Generate a billing platform spec" }],
    nodes: canvas.nodes,
    edges: canvas.edges,
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
          nodes: canvas.nodes.map((node) => ({
            id: node.id,
            type: node.type,
            position: node.position,
            data: node.data,
          })),
          edges: canvas.edges.map((edge) => ({
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
          nodeCount: canvas.nodes.length,
          edgeCount: canvas.edges.length,
        },
      ],
    },
  })
  assert(promptPack.globalPrompt.markdown.length > 0, "mock Prompt Pack should return a global prompt")
  assert(promptPack.layerPrompts.length === 1, "mock Prompt Pack should return a layer prompt")
  assert(promptPack.nodePrompts.length >= 1, "mock Prompt Pack should return node prompts")

  const invalidDesign = DesignProviderResultSchema.safeParse({
    summary: "invalid",
    actions: [{ type: "addNode", id: "missing-required-fields" }],
  })
  assert(!invalidDesign.success, "invalid design actions should be rejected")

  clearAiEnv()
  process.env.AI_PROVIDER = "unknown"
  expectThrows(() => getAiProvider(), "AI_PROVIDER")

  clearAiEnv()
  process.env.AI_PROVIDER = "google"
  expectThrows(() => getAiProvider(), "Missing Google AI API key")

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
