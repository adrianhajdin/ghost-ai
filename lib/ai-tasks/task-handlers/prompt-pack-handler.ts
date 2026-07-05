import { z } from "zod"
import { getAiProvider } from "@/lib/ai/providers/provider-factory"
import {
  LLM_PROMPT_PACK_SCOPE_MODES,
  LLM_PROMPT_PACK_TARGET_AGENTS,
  createLlmPromptPackSummary,
  exportLlmPromptPackMarkdown,
  parseLlmPromptPackProposal,
} from "@/lib/prompt-pack/llm-prompt-pack"
import { loadProjectCanvasPyramid } from "@/lib/canvas/canvas-pyramid"
import { buildLlmContextPyramid } from "@/lib/ai/context/llm-context-pyramid"
import { previewLlmCanvasImprovementProposal } from "@/lib/canvas/llm-canvas-patch"
import { ROOT_GRAPH_ID, graphIdFromSearchParam } from "@/lib/canvas/graph-ids"

const MAX_CANVAS_PYRAMID_JSON_CHARS = 240_000

export const PromptPackPayloadSchema = z.object({
  projectId: z.string().trim().min(1),
  projectName: z.string().trim().min(1),
  graphId: z.string().trim().min(1).default(ROOT_GRAPH_ID),
  userId: z.string().trim().min(1),
  targetAgent: z.enum(LLM_PROMPT_PACK_TARGET_AGENTS),
  scopeMode: z.enum(LLM_PROMPT_PACK_SCOPE_MODES),
  selectedNodeIds: z.array(z.string().trim().min(1).max(120)).default([]),
  instructions: z.string().trim().max(4000).optional(),
})

export type PromptPackPayload = z.infer<typeof PromptPackPayloadSchema>

function pyramidStats(
  pyramid: Awaited<ReturnType<typeof loadProjectCanvasPyramid>>
) {
  return pyramid.graphs.reduce(
    (stats, graph) => ({
      graphCount: stats.graphCount + 1,
      nodeCount: stats.nodeCount + graph.nodes.length,
      edgeCount: stats.edgeCount + graph.edges.length,
    }),
    { graphCount: 0, nodeCount: 0, edgeCount: 0 }
  )
}

export async function runPromptPackTask(payload: PromptPackPayload) {
  const currentGraphId = graphIdFromSearchParam(payload.graphId)
  if (payload.scopeMode === "selected-nodes" && payload.selectedNodeIds.length === 0) {
    throw new Error("Select at least one node before generating a selected-node Prompt Pack.")
  }

  const canvasPyramid = await loadProjectCanvasPyramid(payload.projectId)
  const serializedPyramid = JSON.stringify(canvasPyramid)

  if (serializedPyramid.length > MAX_CANVAS_PYRAMID_JSON_CHARS) {
    throw new Error(
      "The canvas pyramid is too large for this Prompt Pack request. Generate for the current layer or selected nodes."
    )
  }

  const provider = getAiProvider()
  const llmContextPyramid = buildLlmContextPyramid({
    projectId: payload.projectId,
    projectName: payload.projectName,
    providerName: provider.name,
    currentGraphId,
    selectedNodeIds: payload.selectedNodeIds,
    canvasPyramid,
  })
  const providerResult = await provider.generatePromptPack({
    projectId: payload.projectId,
    projectName: payload.projectName,
    targetAgent: payload.targetAgent,
    scopeMode: payload.scopeMode,
    currentGraphId,
    selectedNodeIds: payload.selectedNodeIds,
    instructions: payload.instructions,
    canvasPyramid,
    llmContextPyramid,
  })
  const proposal = parseLlmPromptPackProposal(providerResult)
  if (proposal.canvasImprovementProposal) {
    proposal.canvasImprovementProposal.preview = await previewLlmCanvasImprovementProposal({
      projectId: payload.projectId,
      currentGraphId,
      proposal: proposal.canvasImprovementProposal,
    })
  }
  const markdown = exportLlmPromptPackMarkdown(proposal)

  return {
    proposal,
    markdown,
    summary: createLlmPromptPackSummary(proposal),
    canvasPyramidSummary: pyramidStats(canvasPyramid),
  }
}
