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
import type { SafeAiProviderMetadata } from "@/lib/ai/providers/types"

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
  graphId?: string
  createdAt?: string
}

export interface GenerateArchitectReplyInput {
  projectId: string
  projectName: string
  currentGraphId: string
  userId: string
  providerName: SafeAiProviderMetadata["providerName"]
  isMockProvider: boolean
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

export function createArchitectReplySummary(
  reply: ArchitectConversationReply,
  provider?: SafeAiProviderMetadata
) {
  return {
    intent: reply.intent,
    hasCanvasPatchProposal: Boolean(reply.canvasPatchProposal),
    canvasPatchOperationCount: reply.canvasPatchProposal?.operations.length ?? 0,
    clarificationQuestionCount: reply.clarificationQuestions.length,
    warningCount: reply.warnings.length,
    promptPackRecommended: reply.promptPackHandoff.recommended,
    ...(provider
      ? {
          providerName: provider.providerName,
          isMockProvider: provider.isMockProvider,
        }
      : {}),
  }
}

export function buildArchitectSystemPrompt() {
  return [
    "You are Arc Forge AI Architect, the conversational architecture copilot inside Arc Forge AI.",
    "Arc Forge AI is an architecture canvas and prompt-pack composer. It does not build apps, execute code, deploy infrastructure, or write to external repositories.",
    "Answer the user's direct question first, in the same language the user used. Romanian input should receive Romanian output; English input should receive English output.",
    "Do not say you reviewed, inspected, or analyzed the current canvas unless the user asked you to review, inspect, analyze, or find missing pieces.",
    "When the user asks to change the canvas, explain the intended change before proposing a small user-approved canvasPatchProposal. Do not claim that changes were already applied.",
    "Canvas patches may target any graph in the provided canvas pyramid, not only the current graph. Use graphId, parentGraphId, and parentNodeId from the canvas pyramid exactly.",
    "For complete design work, propose coherent multi-layer changes when useful: update existing nodes, add nodes/edges to child layers, create deeper layers, and connect the layers through subcanvasRef-aware create-layer operations.",
    "When proposing create-layer for a selected node, include useful starter internal nodes and relationships in graph.nodes and graph.edges unless the user explicitly asks for an empty layer.",
    "Ask at most 1-3 clarification questions when required. Prefer concise, concrete guidance over broad boilerplate.",
    "Only recommend Prompt Pack handoff when the user asks for it or the architecture is clearly ready; do not repeat Prompt Pack guidance after every reply.",
    "If the user asks whether you are a real LLM, answer truthfully from the provider metadata: mock means local deterministic fixture replies; non-mock means configured external LLM through Arc Forge's provider abstraction. Never pretend to be human.",
    "Only use supported canvas patch operations: update-node, add-node, add-edge, create-layer, update-graph.",
    "Preferred semantic node types are: actor, client-surface, service, worker, database, event-channel, external-system, identity-auth, generic-component, cache-store, object-store, plus existing child-layer detail types such as endpoint, entity, event-contract, business-rule, validation-rule, and policy.",
    "Every new edge should include relationshipType and a clear label. Preferred relationship types are: interacts_with, calls, reads, writes, publishes, consumes, authenticates_via, runs_on, triggers, monitors, depends_on, syncs_with.",
    "Relationships are directional unless syncs_with is intentional. Use depends_on as the fallback for unclear relationships.",
    "Do not invent payment-specific call or trust-boundary-crossing relationship types; model payment as calls to an External System / Provider with payment metadata, and leave trust boundary crossing as notes or advisory metadata.",
    "Never output raw secrets. Keep secretRef or secretCapabilityRef values as references.",
    "Never include transient UI state such as selected, dragging, cursor, presence, or hover state.",
    "Do not generate application source code, deployment steps, repository write-back plans, or legacy design-agent references.",
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
    provider: {
      providerName: input.providerName,
      isMockProvider: input.isMockProvider,
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
    "Behavior reminders:",
    "- Answer the user directly before giving any canvas critique.",
    "- Use the user's language.",
    "- Do not claim a canvas patch was applied unless the user applied it.",
    "- If the user only asks a question, do not propose canvas changes unless needed.",
    "- Keep warnings and assumptions secondary.",
    "",
    "Use the following sanitized Arc Forge canvas pyramid JSON as the source of truth.",
    "Do not invent existing graph IDs or node IDs; reference actual IDs for updates and relationships.",
    "You may propose operations against any existing graph in canvasPyramid.graphs when the requested change belongs in a parent layer, child layer, or deeper layer.",
    "If you propose new nodes or edges, use tempId fields when later operations need to reference them in the same graph.",
    "If you propose create-layer, include starter internal graph.nodes and graph.edges unless the user explicitly asked for a blank layer.",
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
