import { z } from "zod"
import { getAiProvider } from "@/lib/ai/providers/provider-factory"
import { ArchitectureDraftComplexitySchema } from "@/lib/architecture-draft/architecture-draft"
import {
  createArchitectureDraftSummary,
  sanitizeArchitectureDraftProposal,
  summarizeCanvasForArchitectureDraft,
  validateArchitectureDraftProposal,
} from "@/lib/architecture-draft/architecture-draft"
import { createCanvasDocV1, type CanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { emptyCanvasSnapshot } from "@/lib/canvas/canvas-state"
import { readCanvasDoc } from "@/lib/canvas/canvas-persistence"
import { compileCanvasDocsToDesignIrResult } from "@/lib/canvas/design-ir"
import { ROOT_GRAPH_ID, graphIdFromSearchParam, isValidGraphId } from "@/lib/canvas/graph-ids"

export const ArchitectureDraftPayloadSchema = z.object({
  prompt: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  graphId: z.string().trim().min(1).default(ROOT_GRAPH_ID),
  userId: z.string().trim().min(1),
  complexity: ArchitectureDraftComplexitySchema.default("standard"),
})

export type ArchitectureDraftPayload = z.infer<typeof ArchitectureDraftPayloadSchema>

async function collectLinkedCanvasDocs(
  projectId: string,
  rootDoc: CanvasDocV1,
  activeDoc: CanvasDocV1
) {
  const docs = [rootDoc]
  const seenGraphIds = new Set([rootDoc.graphId])
  const pendingGraphIds = rootDoc.nodes
    .map((node) => node.data.subcanvasRef?.graphId)
    .filter((graphId): graphId is string => Boolean(graphId?.trim()))
    .filter((graphId) => isValidGraphId(graphId))

  if (!seenGraphIds.has(activeDoc.graphId)) {
    docs.push(activeDoc)
    seenGraphIds.add(activeDoc.graphId)
  }

  while (pendingGraphIds.length > 0) {
    const nextGraphId = pendingGraphIds.shift()
    if (!nextGraphId || seenGraphIds.has(nextGraphId)) continue
    seenGraphIds.add(nextGraphId)

    const childDoc = await readCanvasDoc(projectId, nextGraphId)
    if (!childDoc) continue

    docs.push(childDoc)
    pendingGraphIds.push(
      ...childDoc.nodes
        .map((node) => node.data.subcanvasRef?.graphId)
        .filter((graphId): graphId is string => Boolean(graphId?.trim()))
        .filter((graphId) => isValidGraphId(graphId))
    )
  }

  return docs
}

export async function runArchitectureDraftTask(payload: ArchitectureDraftPayload) {
  const graphId = graphIdFromSearchParam(payload.graphId)

  const currentDoc = await readCanvasDoc(payload.projectId, graphId)
  const activeDoc =
    currentDoc ??
    createCanvasDocV1(emptyCanvasSnapshot(), {
      projectId: payload.projectId,
      graphId,
      scopeKind: graphId === ROOT_GRAPH_ID ? "system-root" : "architecture-layer",
      title: graphId === ROOT_GRAPH_ID ? "System" : "Design layer",
    })
  const rootDoc =
    graphId === ROOT_GRAPH_ID
      ? activeDoc
      : (await readCanvasDoc(payload.projectId, ROOT_GRAPH_ID)) ??
        createCanvasDocV1(emptyCanvasSnapshot(), {
          projectId: payload.projectId,
          graphId: ROOT_GRAPH_ID,
        })
  const existingDesignIr = compileCanvasDocsToDesignIrResult(
    await collectLinkedCanvasDocs(payload.projectId, rootDoc, activeDoc),
    {
      projectId: payload.projectId,
      rootOnly: false,
    }
  ).ir
  const currentCanvasSummary = summarizeCanvasForArchitectureDraft(activeDoc)
  const rootCanvasSummary = summarizeCanvasForArchitectureDraft(rootDoc)

  const proposal = sanitizeArchitectureDraftProposal(
    await getAiProvider().generateArchitectureDraft({
      prompt: payload.prompt,
      projectId: payload.projectId,
      graphId,
      complexity: payload.complexity,
      existingDesignIr,
      currentCanvasSummary,
      rootCanvasSummary,
      graphHierarchySummary: {
        activeGraphId: graphId,
        graphs: existingDesignIr.graphs.map((graph) => ({
          graphId: graph.graphId,
          title: graph.title,
          scopeKind: graph.scopeKind,
          parentNodeId: graph.parentNodeId,
          nodeCount: graph.nodeCount,
          edgeCount: graph.edgeCount,
        })),
      },
    })
  )
  const validation = validateArchitectureDraftProposal(proposal, {
    targetGraphId: graphId,
    existingCanvas: { nodes: activeDoc.nodes, edges: activeDoc.edges },
  })

  return {
    proposal,
    summary: createArchitectureDraftSummary(proposal, validation),
    validation,
  }
}
