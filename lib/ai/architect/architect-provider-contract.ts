import { z } from "zod"
import type { CanvasPyramid, CanvasPyramidGraphIndexEntry } from "@/lib/canvas/canvas-pyramid"
import {
  LlmCanvasImprovementProposalSchema,
  getLlmCanvasPatchTransportIssues,
  type LlmCanvasImprovementProposal,
} from "@/lib/canvas/llm-canvas-patch-contract"
import {
  LLM_PROMPT_PACK_SCOPE_MODES,
  LLM_PROMPT_PACK_TARGET_AGENTS,
  type LlmPromptPackScopeMode,
  type LlmPromptPackTargetAgent,
} from "@/lib/prompt-pack/llm-prompt-pack"

export const ARCHITECT_CONVERSATION_SCHEMA_URL =
  "https://arcforge.dev/schemas/architect-conversation.v1.json" as const
export const ARCHITECT_CONVERSATION_VERSION = "1.0.0" as const

export const ARCHITECT_CONVERSATION_INTENTS = [
  "answer",
  "clarify",
  "inspect-canvas",
  "propose-canvas-changes",
  "prompt-pack-ready",
] as const

const ArchitectPromptPackHandoffSchema = z
  .object({
    recommended: z.boolean().default(false),
    reason: z.string().trim().max(2000).default(""),
    suggestedTargetAgents: z
      .array(z.enum(LLM_PROMPT_PACK_TARGET_AGENTS))
      .max(3)
      .default(["codex"]),
    suggestedScopeMode: z.enum(LLM_PROMPT_PACK_SCOPE_MODES).default("full-project"),
  })
  .default({
    recommended: false,
    reason: "",
    suggestedTargetAgents: ["codex"],
    suggestedScopeMode: "full-project",
  })

export const ArchitectConversationReplySchema = z
  .object({
    $schema: z
      .literal(ARCHITECT_CONVERSATION_SCHEMA_URL)
      .default(ARCHITECT_CONVERSATION_SCHEMA_URL),
    replyVersion: z
      .literal(ARCHITECT_CONVERSATION_VERSION)
      .default(ARCHITECT_CONVERSATION_VERSION),
    status: z.literal("draft").default("draft"),
    conversationId: z.string().trim().min(1).max(120).optional(),
    intent: z.enum(ARCHITECT_CONVERSATION_INTENTS).default("answer"),
    assistantMessage: z.object({
      role: z.literal("assistant").default("assistant"),
      content: z.string().trim().min(1).max(12000),
    }),
    canvasPatchProposal: LlmCanvasImprovementProposalSchema.nullish(),
    promptPackHandoff: ArchitectPromptPackHandoffSchema,
    clarificationQuestions: z.array(z.string().trim().min(1).max(800)).max(8).default([]),
    assumptions: z.array(z.string().trim().min(1).max(800)).max(12).default([]),
    warnings: z.array(z.string().trim().min(1).max(800)).max(12).default([]),
    suggestedNextSteps: z.array(z.string().trim().min(1).max(800)).max(12).default([]),
  })
  .passthrough()

export type ArchitectConversationIntent =
  (typeof ARCHITECT_CONVERSATION_INTENTS)[number]

export type ArchitectConversationReply = z.infer<
  typeof ArchitectConversationReplySchema
>

export interface ArchitectConversationMessageInput {
  role: "user" | "assistant"
  content: string
  createdAt?: string
}

export interface GenerateArchitectReplyInput {
  projectId: string
  projectName: string
  currentGraphId: string
  userId: string
  userMessage: string
  selectedNodeIds: string[]
  recentMessages: ArchitectConversationMessageInput[]
  canvasPyramid: CanvasPyramid
}

export type GenerateArchitectReplyResult = ArchitectConversationReply

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function summarizeGraphIndex(index: CanvasPyramidGraphIndexEntry[]) {
  return index.map((entry) => ({
    graphId: entry.graphId,
    title: entry.title,
    parentGraphId: entry.parentGraphId,
    parentNodeId: entry.parentNodeId,
    layer: entry.layer,
    layerKind: entry.layerKind,
    nodeCount: entry.nodeCount,
    edgeCount: entry.edgeCount,
  }))
}

export function parseArchitectConversationReply(value: unknown) {
  const reply = ArchitectConversationReplySchema.parse(value)
  const issues = getLlmCanvasPatchTransportIssues(reply)
  if (issues.length > 0) {
    throw new Error(issues[0] ?? "Unsafe Architect conversation transport.")
  }
  return reply
}

export function createArchitectReplySummary(reply: ArchitectConversationReply) {
  return {
    intent: reply.intent,
    hasCanvasPatchProposal: Boolean(reply.canvasPatchProposal),
    canvasPatchOperationCount: reply.canvasPatchProposal?.operations.length ?? 0,
    clarificationQuestionCount: reply.clarificationQuestions.length,
    warningCount: reply.warnings.length,
    promptPackRecommended: reply.promptPackHandoff.recommended,
  }
}

export function buildArchitectSystemPrompt() {
  return [
    "You are Arc Forge AI Architect, the conversational architecture copilot inside Arc Forge AI.",
    "Arc Forge AI is an architecture canvas and prompt-pack composer. It does not build apps, execute code, deploy infrastructure, or write to external repositories.",
    "You inspect the provided CanvasDoc pyramid and answer the user's command one step at a time.",
    "When the user asks to change the canvas, propose a small user-approved canvasPatchProposal. Do not claim that changes were already applied.",
    "Only use supported canvas patch operations: update-node, add-node, add-edge, create-layer, update-graph.",
    "Never output raw secrets. Keep secretRef or secretCapabilityRef values as references.",
    "Never include transient UI state such as selected, dragging, cursor, presence, or hover state.",
    "If the architecture is ready for an external coding agent, set promptPackHandoff.recommended=true and explain why.",
    "Return only valid JSON matching the Architect Conversation v1 schema.",
  ].join("\n")
}

export function buildArchitectUserPrompt(input: GenerateArchitectReplyInput) {
  const currentGraph = input.canvasPyramid.graphs.find(
    (graph) => graph.graphId === input.currentGraphId
  )
  const graphStats = input.canvasPyramid.graphs.reduce(
    (stats, graph) => ({
      graphCount: stats.graphCount + 1,
      nodeCount: stats.nodeCount + graph.nodes.length,
      edgeCount: stats.edgeCount + graph.edges.length,
    }),
    { graphCount: 0, nodeCount: 0, edgeCount: 0 }
  )
  const payload = {
    project: {
      id: input.projectId,
      name: input.projectName,
    },
    currentGraphId: input.currentGraphId,
    selectedNodeIds: input.selectedNodeIds,
    currentGraphSummary: currentGraph
      ? {
          graphId: currentGraph.graphId,
          title: currentGraph.title,
          layer: currentGraph.layer,
          layerKind: currentGraph.layerKind,
          nodeCount: currentGraph.nodes.length,
          edgeCount: currentGraph.edges.length,
        }
      : null,
    canvasPyramidSummary: {
      ...graphStats,
      graphIndex: summarizeGraphIndex(input.canvasPyramid.graphIndex),
    },
    recentMessages: input.recentMessages,
    canvasPyramid: input.canvasPyramid,
  }

  return [
    `User command: ${input.userMessage}`,
    "",
    "Use the following sanitized Arc Forge canvas pyramid JSON as the source of truth.",
    "Do not invent existing node IDs; reference actual IDs for updates and relationships.",
    "If you propose new nodes or edges, use tempId fields when later operations need to reference them.",
    "",
    JSON.stringify(isRecord(payload) ? payload : {}, null, 2),
  ].join("\n")
}

export function createPromptPackHandoffLabel(input: {
  recommended: boolean
  suggestedTargetAgents: LlmPromptPackTargetAgent[]
  suggestedScopeMode: LlmPromptPackScopeMode
}) {
  if (!input.recommended) return "Continue refining architecture"
  return `Ready for Prompt Pack (${input.suggestedTargetAgents.join(", ")}, ${input.suggestedScopeMode})`
}

export function hasArchitectPatchOperations(
  proposal: LlmCanvasImprovementProposal | null | undefined
) {
  return Boolean(proposal?.operations.length)
}
