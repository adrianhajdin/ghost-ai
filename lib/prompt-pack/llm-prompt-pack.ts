import { z } from "zod"
import {
  LLM_TRANSPORT_TRANSIENT_KEYS,
  sanitizeLlmTransportRecord,
  sanitizeLlmTransportValue,
} from "@/lib/canvas/canvas-pyramid"
import {
  looksLikeRawSecretValue,
  shouldStripSecretField,
} from "@/lib/canvas/secret-guards"
import { ROOT_GRAPH_ID } from "@/lib/canvas/graph-ids"

export const LLM_PROMPT_PACK_SCHEMA_URL =
  "https://arcforge.dev/schemas/llm-prompt-pack.v1.json" as const
export const LLM_PROMPT_PACK_VERSION = "1.0.0" as const

export const LLM_PROMPT_PACK_TARGET_AGENTS = [
  "codex",
  "claude-code",
  "generic-ai-builder",
] as const

export type LlmPromptPackTargetAgent =
  (typeof LLM_PROMPT_PACK_TARGET_AGENTS)[number]

export const LLM_PROMPT_PACK_SCOPE_MODES = [
  "full-project",
  "current-layer",
  "selected-nodes",
] as const

export type LlmPromptPackScopeMode =
  (typeof LLM_PROMPT_PACK_SCOPE_MODES)[number]

const ALLOWED_CANVAS_PATCH_OPS = [
  "update-node",
  "add-node",
  "add-edge",
  "create-layer",
  "update-graph",
] as const

const PositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

const PatchNodeSchema = z
  .object({
    id: z.string().trim().min(1).max(120).optional(),
    label: z.string().trim().min(1).max(240),
    semanticType: z.string().trim().min(1).max(120).optional(),
    type: z.string().trim().min(1).max(120).optional(),
    name: z.string().trim().max(240).optional(),
    description: z.string().trim().max(4000).optional(),
    metadata: z.record(z.unknown()).default({}),
    position: PositionSchema.optional(),
  })
  .passthrough()

const PatchEdgeSchema = z
  .object({
    id: z.string().trim().min(1).max(120).optional(),
    source: z.string().trim().min(1).max(120),
    target: z.string().trim().min(1).max(120),
    semanticType: z.string().trim().min(1).max(120).optional(),
    type: z.string().trim().min(1).max(120).optional(),
    label: z.string().trim().max(240).optional(),
    labels: z.array(z.string().trim().max(240)).max(8).default([]),
    metadata: z.record(z.unknown()).default({}),
  })
  .passthrough()

const UpdateNodeOperationSchema = z.object({
  op: z.literal("update-node"),
  graphId: z.string().trim().min(1).max(120),
  nodeId: z.string().trim().min(1).max(120),
  patch: z.record(z.unknown()).default({}),
})

const AddNodeOperationSchema = z.object({
  op: z.literal("add-node"),
  graphId: z.string().trim().min(1).max(120),
  tempId: z.string().trim().min(1).max(120).optional(),
  node: PatchNodeSchema,
})

const AddEdgeOperationSchema = z.object({
  op: z.literal("add-edge"),
  graphId: z.string().trim().min(1).max(120),
  tempId: z.string().trim().min(1).max(120).optional(),
  edge: PatchEdgeSchema,
})

const CreateLayerOperationSchema = z.object({
  op: z.literal("create-layer"),
  parentGraphId: z.string().trim().min(1).max(120),
  parentNodeId: z.string().trim().min(1).max(120),
  graph: z
    .object({
      title: z.string().trim().min(1).max(240),
      layerKind: z.string().trim().min(1).max(120).optional(),
      summary: z.string().trim().max(2000).optional(),
      nodes: z.array(PatchNodeSchema).default([]),
      edges: z.array(PatchEdgeSchema).default([]),
    })
    .passthrough(),
})

const UpdateGraphOperationSchema = z.object({
  op: z.literal("update-graph"),
  graphId: z.string().trim().min(1).max(120),
  patch: z
    .object({
      title: z.string().trim().min(1).max(240).optional(),
      summary: z.string().trim().max(2000).optional(),
      layerKind: z.string().trim().min(1).max(120).optional(),
      metadata: z.record(z.unknown()).optional(),
    })
    .passthrough(),
})

const UnsupportedCanvasPatchOperationSchema = z
  .object({
    op: z
      .string()
      .trim()
      .min(1)
      .refine(
        (op) =>
          !(ALLOWED_CANVAS_PATCH_OPS as readonly string[]).includes(op),
        "Allowed patch operations must include their required transport fields."
      ),
  })
  .passthrough()

export const LlmCanvasPatchOperationSchema = z.union([
  UpdateNodeOperationSchema,
  AddNodeOperationSchema,
  AddEdgeOperationSchema,
  CreateLayerOperationSchema,
  UpdateGraphOperationSchema,
  UnsupportedCanvasPatchOperationSchema,
])

export const LlmCanvasImprovementProposalSchema = z
  .object({
    summary: z.string().trim().max(4000).default(""),
    operations: z.array(LlmCanvasPatchOperationSchema).default([]),
  })
  .passthrough()

export const LlmPromptPackProposalSchema = z
  .object({
    $schema: z
      .literal(LLM_PROMPT_PACK_SCHEMA_URL)
      .default(LLM_PROMPT_PACK_SCHEMA_URL),
    packVersion: z.literal(LLM_PROMPT_PACK_VERSION).default(LLM_PROMPT_PACK_VERSION),
    status: z.literal("draft").default("draft"),
    title: z.string().trim().min(1).max(240),
    targetAgent: z.enum(LLM_PROMPT_PACK_TARGET_AGENTS),
    scope: z.object({
      mode: z.enum(LLM_PROMPT_PACK_SCOPE_MODES),
      rootGraphId: z.string().trim().min(1).default(ROOT_GRAPH_ID),
      currentGraphId: z.string().trim().min(1).default(ROOT_GRAPH_ID),
      selectedNodeIds: z.array(z.string().trim().min(1).max(120)).default([]),
    }),
    summary: z.string().trim().max(8000).default(""),
    globalPrompt: z.object({
      title: z.string().trim().min(1).max(240),
      markdown: z.string().min(1),
    }),
    layerPrompts: z
      .array(
        z.object({
          graphId: z.string().trim().min(1).max(120),
          title: z.string().trim().min(1).max(240),
          markdown: z.string().min(1),
          coveredNodeIds: z.array(z.string().trim().min(1).max(120)).default([]),
        })
      )
      .default([]),
    nodePrompts: z
      .array(
        z.object({
          graphId: z.string().trim().min(1).max(120),
          nodeId: z.string().trim().min(1).max(120),
          nodeLabel: z.string().trim().min(1).max(240),
          title: z.string().trim().min(1).max(240),
          markdown: z.string().min(1),
          dependsOnNodeIds: z.array(z.string().trim().min(1).max(120)).default([]),
          relatedGraphIds: z.array(z.string().trim().min(1).max(120)).default([]),
        })
      )
      .default([]),
    canvasImprovementProposal: LlmCanvasImprovementProposalSchema.nullish(),
    clarificationQuestions: z.array(z.string()).default([]),
    assumptions: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
    suggestedNextSteps: z.array(z.string()).default([]),
  })
  .passthrough()

export type LlmCanvasPatchOperation = z.infer<typeof LlmCanvasPatchOperationSchema>
export type LlmCanvasImprovementProposal = z.infer<
  typeof LlmCanvasImprovementProposalSchema
>
export type LlmPromptPackProposal = z.infer<typeof LlmPromptPackProposalSchema>

export interface LlmPromptPackSummary {
  title: string
  targetAgent: LlmPromptPackTargetAgent
  globalPromptPresent: boolean
  layerPromptCount: number
  nodePromptCount: number
  canvasImprovementOperationCount: number
  clarificationQuestionCount: number
  warningCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function collectUnsafeTransportIssues(
  value: unknown,
  path: string,
  key: string,
  issues: string[]
) {
  if (LLM_TRANSPORT_TRANSIENT_KEYS.has(key)) {
    issues.push(`Transient UI state is not allowed at ${path || key}.`)
    return
  }

  if (shouldStripSecretField(key, value)) {
    issues.push(`Raw secret-looking value detected at ${path || key}.`)
    return
  }

  if (typeof value === "string" && looksLikeRawSecretValue(value)) {
    issues.push(`Raw secret-looking value detected at ${path || key || "root"}.`)
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectUnsafeTransportIssues(item, `${path}[${index}]`, key, issues)
    })
    return
  }

  if (isRecord(value)) {
    for (const [childKey, childValue] of Object.entries(value)) {
      collectUnsafeTransportIssues(
        childValue,
        path ? `${path}.${childKey}` : childKey,
        childKey,
        issues
      )
    }
  }
}

export function getPromptPackTransportIssues(value: unknown) {
  const issues: string[] = []
  collectUnsafeTransportIssues(value, "", "", issues)
  return issues
}

export function parseLlmPromptPackProposal(value: unknown): LlmPromptPackProposal {
  const proposal = LlmPromptPackProposalSchema.parse(value)
  const issues = getPromptPackTransportIssues(proposal)
  if (issues.length > 0) {
    throw new Error(issues[0] ?? "Unsafe Prompt Pack transport.")
  }
  return proposal
}

export function sanitizePromptPackPatchRecord(value: unknown) {
  return sanitizeLlmTransportRecord(value)
}

export function sanitizePromptPackPatchValue(value: unknown) {
  return sanitizeLlmTransportValue(value)
}

export function isLlmPromptPackTargetAgent(
  value: unknown
): value is LlmPromptPackTargetAgent {
  return (
    typeof value === "string" &&
    (LLM_PROMPT_PACK_TARGET_AGENTS as readonly string[]).includes(value)
  )
}

export function createLlmPromptPackSummary(
  proposal: LlmPromptPackProposal
): LlmPromptPackSummary {
  return {
    title: proposal.title,
    targetAgent: proposal.targetAgent,
    globalPromptPresent: Boolean(proposal.globalPrompt.markdown.trim()),
    layerPromptCount: proposal.layerPrompts.length,
    nodePromptCount: proposal.nodePrompts.length,
    canvasImprovementOperationCount:
      proposal.canvasImprovementProposal?.operations.length ?? 0,
    clarificationQuestionCount: proposal.clarificationQuestions.length,
    warningCount: proposal.warnings.length,
  }
}

function listMarkdown(title: string, items: string[]) {
  if (items.length === 0) return ""
  return [`## ${title}`, "", ...items.map((item) => `- ${item}`), ""].join("\n")
}

export function exportLlmPromptPackMarkdown(proposal: LlmPromptPackProposal) {
  const sections: string[] = [
    `# ${proposal.title}`,
    "",
    proposal.summary,
    "",
    `Target agent: ${proposal.targetAgent}`,
    `Scope: ${proposal.scope.mode}`,
    "",
    `## ${proposal.globalPrompt.title}`,
    "",
    proposal.globalPrompt.markdown,
    "",
  ]

  if (proposal.layerPrompts.length > 0) {
    sections.push("## Layer Prompts", "")
    for (const layer of proposal.layerPrompts) {
      sections.push(`### ${layer.title}`, "", layer.markdown, "")
    }
  }

  if (proposal.nodePrompts.length > 0) {
    sections.push("## Node Prompts", "")
    for (const nodePrompt of proposal.nodePrompts) {
      sections.push(
        `### ${nodePrompt.title}`,
        "",
        `Graph: ${nodePrompt.graphId}`,
        `Node: ${nodePrompt.nodeLabel} (${nodePrompt.nodeId})`,
        "",
        nodePrompt.markdown,
        ""
      )
    }
  }

  sections.push(
    listMarkdown("Clarification Questions", proposal.clarificationQuestions),
    listMarkdown("Assumptions", proposal.assumptions),
    listMarkdown("Warnings", proposal.warnings),
    listMarkdown("Suggested Next Steps", proposal.suggestedNextSteps)
  )

  const improvement = proposal.canvasImprovementProposal
  if (improvement && improvement.operations.length > 0) {
    sections.push("## Canvas Improvements", "", improvement.summary, "")
    improvement.operations.forEach((operation, index) => {
      sections.push(
        `${index + 1}. ${operation.op}`,
        "",
        JSON.stringify(operation, null, 2),
        ""
      )
    })
  }

  return sections.filter((section) => section !== "").join("\n")
}

export function extractCanvasImprovementProposal(
  value: unknown
): LlmCanvasImprovementProposal {
  const record = isRecord(value) ? value : {}
  const raw =
    "canvasImprovementProposal" in record
      ? record.canvasImprovementProposal
      : value

  return LlmCanvasImprovementProposalSchema.parse(raw ?? {
    summary: "",
    operations: [],
  })
}
