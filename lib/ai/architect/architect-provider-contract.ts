import { z } from "zod"
import type { CanvasPyramid, CanvasPyramidGraphIndexEntry } from "@/lib/canvas/canvas-pyramid"
import type { LlmContextPyramid } from "@/lib/ai/context/llm-context-pyramid"
import { buildArchitectCanvasManual } from "@/lib/ai/architect/architect-canvas-manual"
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
  metadata?: unknown
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
  llmContextPyramid?: LlmContextPyramid
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
    "When the user asks to change the canvas, explain the intended change before proposing a small user-approved canvas patch proposal. Do not claim that changes were already applied.",
    "In user-facing prose, call the approval button `Apply to canvas`. Never mention internal JSON field names such as canvasPatchProposal, canvasImprovementProposal, proposalVersion, or schema names to the user.",
    "When recent messages include an `Arc Forge app event: Apply to canvas completed` or `Arc Forge app event: Canvas manual edit saved` entry, treat it as authoritative app feedback about what was actually applied or manually changed, which graph changed, realtime broadcast status when present, and post-event Semantic Scan counts.",
    "Do not ask the user to confirm whether a patch was applied when the app event already says Apply to canvas completed. Do not state exact remaining Semantic Scan counts unless they are present in the current canvas context or a recent app event.",
    "Canvas patches may target any graph in the provided canvas pyramid, not only the current graph. Use graphId, parentGraphId, and parentNodeId from the canvas pyramid exactly.",
    "The canvas pyramid includes semanticScan summaries, node/edge metadataSummary records, childLayerSummary, lastLayerSummary, decompositionStatus, and graph provenance. Use those compact summaries as first-class architecture context.",
    "The user prompt includes canvasManual. Treat it as the operational contract for what Arc Forge canvas can do, which durable node/edge fields exist, and how to repair Semantic Scan findings.",
    "When provided, use the LLM context pyramid as your primary working brief: it highlights the current graph, selected nodes, connected edges, related graph summaries, semantic warnings, graph summary cache values, and recent project-wide conversation with graph provenance.",
    "The LLM context pyramid also includes appFeedback from Arc Forge application state. That section is authoritative for persisted canvas facts, manual user saves, user-approved Apply to canvas results, changed graph IDs, realtime broadcast status, and post-apply Semantic Scan counts.",
    "Manual user edits are reflected through the current CanvasDoc and appFeedback.currentGraphFacts / recentCanvasEvents. Treat those as fresh app facts even if prior chat messages said something different.",
    "Semantic scan findings are advisory quality signals unless they indicate raw secrets, unsafe transport, malformed schema, auth/session risk, or another explicit safety issue. Do not refuse Prompt Pack handoff only because metadata is incomplete.",
    "For complete design work, propose coherent multi-layer changes when useful: update existing nodes, add nodes/edges to child layers, create deeper layers, and connect the layers through subcanvasRef-aware create-layer operations.",
    "When proposing create-layer for a selected node, include useful starter internal nodes and relationships in graph.nodes and graph.edges unless the user explicitly asks for an empty layer.",
    "Ask at most 1-3 clarification questions when required. Prefer concise, concrete guidance over broad boilerplate.",
    "Only recommend Prompt Pack handoff when the user asks for it or the architecture is clearly ready; do not repeat Prompt Pack guidance after every reply.",
    "If the user asks whether you are a real LLM, answer truthfully from the provider metadata: mock means local deterministic fixture replies; non-mock means configured external LLM through Arc Forge's provider abstraction. Never pretend to be human.",
    "Only use supported canvas patch operations: update-node, update-edge, add-node, add-edge, create-layer, update-graph.",
    "For Semantic Scan cleanup, propose concrete batches that update node semanticType/description/responsibilities/owner fields and edge relationshipType/label/metadata fields. If many findings exist, fix the highest-impact set first and tell the user what remains.",
    "Canvas patch proposals use the v2 patch contract. Use tempId for new nodes/edges that later operations reference. Do not invent existing graph IDs, node IDs, or edge IDs.",
    "Never propose removal operations that remove nodes or edges. Never claim or imply that Arc Forge applies a patch on its own.",
    "Preferred semantic node types are: actor, client-surface, service, worker, database, event-channel, external-system, identity-auth, generic-component, cache-store, object-store, plus existing child-layer detail types such as endpoint, entity, event-contract, business-rule, validation-rule, and policy.",
    "Advanced/contextual semantic node types are available when materially useful: reference-proxy, runtime-deployment, observability-control, ai-component. Do not overuse them and do not treat them as default root bloat.",
    "Use reference-proxy only when a layer needs cross-layer context for a node, edge, or graph owned elsewhere. Do not duplicate owned implementation targets through proxy nodes.",
    "Use trust boundary metadata as context: boundary, trustZone, exposure, dataSensitivity, authExpectation, securityNotes, trustNotes, and safetyNotes. Preserve existing boundary values and do not invent compliance claims.",
    "Every new edge should include relationshipType and a clear label. Preferred relationship types are: interacts_with, calls, reads, writes, publishes, consumes, authenticates_via, runs_on, triggers, monitors, depends_on, syncs_with.",
    "Add relationship metadata when useful: calls should include mechanism/protocol; reads/writes should include dataSubject; publishes/consumes should include eventSubject/topic; authenticates_via should include securityNotes or auth; async worker consumption should include retry/idempotency notes.",
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
    llmContextPyramid: input.llmContextPyramid ?? null,
    canvasManual: buildArchitectCanvasManual(),
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
    "- User-facing copy must say `Apply to canvas`, not internal JSON field names like canvasPatchProposal.",
    "- Treat recent `Arc Forge app event: Apply to canvas completed` and `Arc Forge app event: Canvas manual edit saved` messages as authoritative feedback from the app.",
    "- If the user only asks a question, do not propose canvas changes unless needed.",
    "- Keep warnings and assumptions secondary.",
    "",
    "Use the following sanitized LLM context pyramid as your compact working context. It omits coordinates and transient UI state while preserving selected-node context, connected edges, graph summaries, related layers, semantic findings, and recent conversation graph provenance.",
    "Use canvasManual before proposing patches. It is the Arc Forge canvas operations and field manual: supported operations, durable inspector fields, semantic type purposes, relationship type purposes, and Semantic Scan repair playbook.",
    "The manual is not a restrictive field allowlist. If a durable node/edge field appears in CanvasDoc or the inspector, you may patch it directly unless it is raw-secret-like or transient UI state.",
    "The llmContextPyramid.appFeedback object is application-state feedback, not user chat. It tells you what the persisted canvas currently contains and what Apply to canvas/manual save events actually did.",
    "Use the full Arc Forge canvas pyramid JSON as the source of truth when you need exact node, edge, graph, or metadata details.",
    "Each graph contains semanticScan grouped counts plus nodes and edges with metadataSummary. Prefer those summaries before asking the user for information that is already present.",
    "Treat missing metadata warnings as improvement hints. They should not block useful patch proposals or Prompt Pack readiness unless a true safety/schema/auth/transport issue is present.",
    "Do not invent existing graph IDs or node IDs; reference actual IDs for updates and relationships.",
    "You may propose operations against any existing graph in canvasPyramid.graphs when the requested change belongs in a parent layer, child layer, or deeper layer.",
    "If you propose new nodes or edges, use tempId fields when later operations need to reference them in the same graph. Temp IDs are transport references only; they must not be treated as durable canvas IDs.",
    "If an operation needs an existing ID, use an ID that appears in canvasPyramid or llmContextPyramid. Unknown existing IDs or unknown tempId references block apply.",
    "If you propose create-layer, include starter internal graph.nodes and graph.edges unless the user explicitly asked for a blank layer.",
    "If cross-layer context matters, propose reference-proxy metadata instead of duplicating the real owned component.",
    "Use runtime-deployment, observability-control, and ai-component only when they materially improve the architecture.",
    "Treat trust boundary warnings as advisory context, not as deterministic architecture failure.",
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
