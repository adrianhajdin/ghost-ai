import { z } from "zod"
import { getAiProvider } from "@/lib/ai/providers/provider-factory"
import { ArchitectureDraftComplexitySchema } from "@/lib/architecture-draft/architecture-draft"
import {
  createArchitectureDraftSummary,
  sanitizeArchitectureDraftProposal,
  summarizeCanvasForArchitectureDraft,
  validateArchitectureDraftProposal,
} from "@/lib/architecture-draft/architecture-draft"
import { createCanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { emptyCanvasSnapshot } from "@/lib/canvas/canvas-state"
import { readCanvasDoc } from "@/lib/canvas/canvas-persistence"
import { compileCanvasDocsToDesignIrResult } from "@/lib/canvas/design-ir"
import { ROOT_GRAPH_ID, graphIdFromSearchParam } from "@/lib/canvas/graph-ids"

export const ArchitectureDraftPayloadSchema = z.object({
  prompt: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  graphId: z.string().trim().min(1).default(ROOT_GRAPH_ID),
  userId: z.string().trim().min(1),
  complexity: ArchitectureDraftComplexitySchema.default("standard"),
})

export type ArchitectureDraftPayload = z.infer<typeof ArchitectureDraftPayloadSchema>

export async function runArchitectureDraftTask(payload: ArchitectureDraftPayload) {
  const graphId = graphIdFromSearchParam(payload.graphId)
  if (graphId !== ROOT_GRAPH_ID) {
    throw new Error("Architecture Draft v1 only supports the root graph.")
  }

  const currentDoc = await readCanvasDoc(payload.projectId, graphId)
  const rootDoc =
    currentDoc ??
    createCanvasDocV1(emptyCanvasSnapshot(), {
      projectId: payload.projectId,
      graphId,
    })
  const existingDesignIr = compileCanvasDocsToDesignIrResult([rootDoc], {
    projectId: payload.projectId,
    rootOnly: true,
  }).ir

  const proposal = sanitizeArchitectureDraftProposal(
    await getAiProvider().generateArchitectureDraft({
      prompt: payload.prompt,
      projectId: payload.projectId,
      graphId,
      complexity: payload.complexity,
      existingDesignIr,
      currentCanvasSummary: summarizeCanvasForArchitectureDraft(rootDoc),
    })
  )
  const validation = validateArchitectureDraftProposal(proposal, {
    targetGraphId: graphId,
    existingCanvas: { nodes: rootDoc.nodes, edges: rootDoc.edges },
  })

  return {
    proposal,
    summary: createArchitectureDraftSummary(proposal, validation),
    validation,
  }
}
