import { z } from "zod"
import {
  getAiProvider,
  getSafeAiProviderMetadata,
} from "@/lib/ai/providers/provider-factory"
import {
  createArchitectReplySummary,
  parseArchitectConversationReply,
} from "@/lib/ai/architect/architect-provider-contract"
import {
  createArchitectConversationMessage,
  getRecentArchitectMessagesForProvider,
} from "@/lib/ai/architect/architect-conversation-store"
import { loadProjectCanvasPyramid } from "@/lib/canvas/canvas-pyramid"
import { ROOT_GRAPH_ID, graphIdFromSearchParam } from "@/lib/canvas/graph-ids"

const MAX_CANVAS_PYRAMID_JSON_CHARS = 240_000

export const ArchitectConversationPayloadSchema = z.object({
  projectId: z.string().trim().min(1),
  projectName: z.string().trim().min(1),
  graphId: z.string().trim().min(1).default(ROOT_GRAPH_ID),
  userId: z.string().trim().min(1),
  userMessage: z.string().trim().min(1).max(8000),
  selectedNodeIds: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
})

export type ArchitectConversationPayload = z.infer<
  typeof ArchitectConversationPayloadSchema
>

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

export async function runArchitectConversationTask(
  payload: ArchitectConversationPayload,
  taskRunId: string
) {
  const currentGraphId = graphIdFromSearchParam(payload.graphId)
  const canvasPyramid = await loadProjectCanvasPyramid(payload.projectId)
  const serializedPyramid = JSON.stringify(canvasPyramid)

  if (serializedPyramid.length > MAX_CANVAS_PYRAMID_JSON_CHARS) {
    throw new Error(
      "The canvas pyramid is too large for this Architect conversation. Refine the current layer or selected nodes first."
    )
  }

  const recentMessages = await getRecentArchitectMessagesForProvider({
    projectId: payload.projectId,
  })
  const provider = getAiProvider()
  const providerMetadata = getSafeAiProviderMetadata(provider.name)
  const providerResult = await provider.generateArchitectReply({
    projectId: payload.projectId,
    projectName: payload.projectName,
    currentGraphId,
    userId: payload.userId,
    providerName: providerMetadata.providerName,
    isMockProvider: providerMetadata.isMockProvider,
    userMessage: payload.userMessage,
    selectedNodeIds: payload.selectedNodeIds,
    recentMessages,
    canvasPyramid,
  })
  const reply = parseArchitectConversationReply(providerResult)
  const summary = createArchitectReplySummary(reply, providerMetadata)
  const assistantMessage = await createArchitectConversationMessage({
    projectId: payload.projectId,
    graphId: currentGraphId,
    userId: payload.userId,
    role: "assistant",
    content: reply.assistantMessage.content,
    linkedRunId: taskRunId,
    metadata: {
      reply,
      summary,
      provider: providerMetadata,
      intent: reply.intent,
      providerName: providerMetadata.providerName,
      isMockProvider: providerMetadata.isMockProvider,
      selectedNodeIds: payload.selectedNodeIds,
      canvasPatchOperationCount: reply.canvasPatchProposal?.operations.length ?? 0,
      promptPackRecommended: reply.promptPackHandoff.recommended,
    },
  })

  return {
    reply,
    assistantMessage,
    summary,
    provider: providerMetadata,
    canvasPyramidSummary: pyramidStats(canvasPyramid),
  }
}
