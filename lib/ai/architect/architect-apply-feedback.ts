import type { CanvasDocV1 } from "@/lib/canvas/canvas-doc"
import type { LlmCanvasPatchApplyResult } from "@/lib/canvas/llm-canvas-patch"
import {
  SEMANTIC_VALIDATION_CATEGORY_LABELS,
  groupSemanticFindings,
  isSemanticFindingHidden,
  normalizeSemanticScanState,
  validateCanvasSemantics,
} from "@/lib/canvas/semantic-validation"

export const ARCHITECT_APPLY_FEEDBACK_KIND = "canvas_patch_apply_result" as const

export interface ArchitectApplySemanticScanSummary {
  graphId: string
  title: string
  nodes: number
  edges: number
  totalFindings: number
  activeFindings: number
  hiddenFindings: number
  blockingFindings: number
  topCategories: string[]
}

export interface ArchitectApplyFeedbackInput {
  currentGraphId: string
  result: LlmCanvasPatchApplyResult
  broadcastedGraphIds: string[]
  realtimeBroadcastFailures: string[]
}

function plural(count: number, singular: string, pluralText = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralText}`
}

export function summarizeSemanticScanAfterApply(
  doc: CanvasDocV1
): ArchitectApplySemanticScanSummary {
  const findings = validateCanvasSemantics({ nodes: doc.nodes, edges: doc.edges })
  const scanState = normalizeSemanticScanState(doc.panels.semanticScan)
  const activeFindings = findings.filter(
    (finding) => !isSemanticFindingHidden(finding, scanState)
  )
  const grouped = [...groupSemanticFindings(activeFindings).entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .map(([category, categoryFindings]) => {
      const label = SEMANTIC_VALIDATION_CATEGORY_LABELS[category]
      return `${label}: ${categoryFindings.length}`
    })

  return {
    graphId: doc.graphId,
    title: doc.title,
    nodes: doc.nodes.length,
    edges: doc.edges.length,
    totalFindings: findings.length,
    activeFindings: activeFindings.length,
    hiddenFindings: Math.max(0, findings.length - activeFindings.length),
    blockingFindings: activeFindings.filter((finding) => finding.blocking).length,
    topCategories: grouped,
  }
}

export function buildArchitectApplyFeedbackMessage(
  input: ArchitectApplyFeedbackInput
) {
  const { result } = input
  const scanSummaries = result.docs.map(summarizeSemanticScanAfterApply)
  const currentScan = scanSummaries.find(
    (summary) => summary.graphId === input.currentGraphId
  )
  const issueSummary = result.issues.length
    ? ` Issues reported: ${result.issues
        .slice(0, 3)
        .map((issue) => issue.message)
        .join(" | ")}.`
    : ""
  const broadcastSummary =
    input.realtimeBroadcastFailures.length > 0
      ? ` Realtime broadcast failed for ${input.realtimeBroadcastFailures.join(", ")}.`
      : input.broadcastedGraphIds.length > 0
        ? ` Realtime snapshots broadcast for ${input.broadcastedGraphIds.join(", ")}.`
        : " No realtime snapshots were broadcast because no graph changed."
  const appliedSummary = [
    plural(result.applied.operations, "operation"),
    plural(result.applied.updateNodes, "node update"),
    plural(result.applied.updateEdges, "edge update"),
    plural(result.applied.addNodes, "node add"),
    plural(result.applied.addEdges, "edge add"),
    plural(result.applied.createLayers, "layer create/reuse", "layer create/reuse operations"),
    plural(result.applied.updateGraphs, "graph update"),
    plural(result.applied.skippedOperations, "skipped operation"),
  ].join("; ")
  const changedGraphs = result.dirtyGraphIds.length
    ? result.dirtyGraphIds.join(", ")
    : "none"
  const currentScanSummary = currentScan
    ? ` Current graph semantic scan after apply: ${currentScan.activeFindings} active finding${currentScan.activeFindings === 1 ? "" : "s"} (${currentScan.blockingFindings} blocking) across ${currentScan.nodes} nodes and ${currentScan.edges} edges${currentScan.topCategories.length ? `; top categories: ${currentScan.topCategories.join(", ")}` : ""}.`
    : ""
  const allScanSummary = scanSummaries.length
    ? ` Updated graph scan summaries: ${scanSummaries
        .map(
          (summary) =>
            `${summary.graphId}: ${summary.activeFindings} active, ${summary.hiddenFindings} hidden`
        )
        .join("; ")}.`
    : ""

  const content =
    result.applied.operations > 0
      ? `Arc Forge app event: Apply to canvas completed. Applied changes: ${appliedSummary}. Changed graphs: ${changedGraphs}.${currentScanSummary} ${allScanSummary}${broadcastSummary}${issueSummary}`.trim()
      : `Arc Forge app event: Apply to canvas completed without writing canvas changes. Applied changes: ${appliedSummary}. Changed graphs: ${changedGraphs}.${currentScanSummary} ${allScanSummary}${broadcastSummary}${issueSummary}`.trim()

  return {
    kind: ARCHITECT_APPLY_FEEDBACK_KIND,
    content,
    summary: {
      currentGraphId: input.currentGraphId,
      applied: result.applied,
      dirtyGraphIds: result.dirtyGraphIds,
      broadcastedGraphIds: input.broadcastedGraphIds,
      realtimeBroadcastFailures: input.realtimeBroadcastFailures,
      semanticScanAfterApply: scanSummaries,
      issueCount: result.issues.length,
      blockingIssueCount: result.preview.blockingIssueCount,
    },
  }
}
