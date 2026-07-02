import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { generateObject, generateText, tool } from "ai"
import { z } from "zod"
import { getGoogleAiApiKey } from "@/lib/ai/google-api-key"
import {
  validateDesignProviderResult,
  type DesignAction,
} from "@/lib/ai/design/design-actions"
import type {
  GenerateDesignActionsInput,
  GenerateDesignActionsResult,
} from "@/lib/ai/design/design-provider-contract"
import {
  SPEC_SYSTEM_PROMPT,
  buildSpecContext,
  type GenerateSpecMarkdownInput,
} from "@/lib/ai/spec/spec-provider-contract"
import type { AiProvider } from "@/lib/ai/providers/types"
import {
  ArchitectureDraftProposalSchema,
  parseArchitectureDraftProposal,
} from "@/lib/architecture-draft/architecture-draft"
import {
  buildArchitectureDraftSystemPrompt,
  buildArchitectureDraftUserPrompt,
  type GenerateArchitectureDraftInput,
  type GenerateArchitectureDraftResult,
} from "@/lib/ai/architecture-draft/architecture-draft-provider-contract"
import { NODE_COLORS, NODE_SHAPES } from "@/types/canvas"
import { AI_ASSISTANT_NAME } from "@/lib/branding"

const COLOR_NAMES = [
  "neutral",
  "blue",
  "purple",
  "orange",
  "red",
  "pink",
  "green",
  "teal",
]

type ToolName =
  | "addNode"
  | "moveNode"
  | "resizeNode"
  | "updateNode"
  | "deleteNode"
  | "addEdge"
  | "deleteEdge"
  | "finalizeDesign"

interface ToolCall {
  toolName: ToolName
  input: Record<string, unknown>
}

function getGoogleDesignModel() {
  return process.env.GOOGLE_AI_MODEL?.trim() || "gemini-2.5-flash"
}

function getGoogleSpecModel() {
  return (
    process.env.GOOGLE_AI_SPEC_MODEL?.trim() ||
    process.env.GOOGLE_AI_MODEL?.trim() ||
    "gemini-2.5-flash"
  )
}

function buildSystemPrompt(): string {
  const colorGuide = NODE_COLORS.map(
    (color, index) =>
      `  ${index} (${COLOR_NAMES[index]}): fill=${color.fill} text=${color.text}`
  ).join("\n")

  return `You are ${AI_ASSISTANT_NAME}, an expert system architect that generates technical architecture diagrams on a collaborative canvas.

ALLOWED SHAPES (use exact value):
- rectangle  -> services, APIs, microservices, components
- cylinder   -> databases, storage, caches
- hexagon    -> external systems, third-party services, boundaries
- circle     -> events, triggers, endpoints, user entry-points
- diamond    -> decision gateways, conditionals
- pill       -> processes, workflows, jobs

COLOR PALETTE (colorIndex 0-7):
${colorGuide}
Recommended mapping:
- 1 (blue)   -> APIs, services, servers
- 7 (teal)   -> databases, storage
- 3 (orange) -> message queues, brokers, async flows
- 6 (green)  -> success paths, healthy services, CDN
- 2 (purple) -> auth, security, identity
- 5 (pink)   -> user-facing UI, clients
- 0 (neutral)-> generic / unclassified

LAYOUT RULES:
- Start top-left at approximately x=100, y=80
- Horizontal gap between sibling nodes: 240-280px
- Vertical gap between rows: 160-200px
- Group related nodes in horizontal rows; use vertical rows for sequential flows
- Edge IDs must be unique, e.g. "edge-api-auth", "edge-1"
- Node IDs must be unique short slugs, e.g. "api-gateway", "user-db", "auth-service"

GENERATION RULES:
- Create 5-12 nodes; do not overcrowd
- Add edges to show data/request flow
- Prefer clear left-to-right or top-to-bottom flows
- When the canvas already has nodes, extend or modify instead of replacing unless asked

INSTRUCTIONS:
- Call addNode for each node you want to place on the canvas
- Call addEdge for each connection between nodes
- Use moveNode, resizeNode, updateNode, deleteNode, and deleteEdge only when modifying existing canvas elements
- Call finalizeDesign last with a 1-2 sentence summary of what was designed`
}

const canvasTools = {
  addNode: tool({
    description: "Add a new node to the canvas",
    inputSchema: z.object({
      id: z.string().describe('Unique slug ID e.g. "api-gateway", "user-db"'),
      label: z.string().describe("Display label for the node"),
      shape: z.enum(NODE_SHAPES).describe("Node shape"),
      colorIndex: z.number().int().min(0).max(7).describe("Color palette index 0-7"),
      x: z.number().describe("X position in pixels"),
      y: z.number().describe("Y position in pixels"),
    }),
  }),
  moveNode: tool({
    description: "Move an existing node to a new position",
    inputSchema: z.object({
      id: z.string().describe("ID of the node to move"),
      x: z.number(),
      y: z.number(),
    }),
  }),
  resizeNode: tool({
    description: "Resize an existing node",
    inputSchema: z.object({
      id: z.string(),
      width: z.number().positive(),
      height: z.number().positive(),
    }),
  }),
  updateNode: tool({
    description: "Update the label, shape, or color of an existing node",
    inputSchema: z.object({
      id: z.string(),
      label: z.string().optional(),
      shape: z.enum(NODE_SHAPES).optional(),
      colorIndex: z.number().int().min(0).max(7).optional(),
    }),
  }),
  deleteNode: tool({
    description: "Delete a node from the canvas",
    inputSchema: z.object({
      id: z.string(),
    }),
  }),
  addEdge: tool({
    description: "Add a directed edge between two nodes",
    inputSchema: z.object({
      id: z.string().describe('Unique edge ID e.g. "edge-api-db"'),
      source: z.string().describe("Source node ID"),
      target: z.string().describe("Target node ID"),
      label: z.string().optional().describe("Optional edge label"),
    }),
  }),
  deleteEdge: tool({
    description: "Delete an edge from the canvas",
    inputSchema: z.object({
      id: z.string(),
    }),
  }),
  finalizeDesign: tool({
    description: "Complete the design and provide a summary; call this last",
    inputSchema: z.object({
      summary: z.string().describe("1-2 sentence description of the designed architecture"),
    }),
  }),
}

function toolCallToAction(call: ToolCall): DesignAction | null {
  if (call.toolName === "finalizeDesign") return null

  return {
    type: call.toolName,
    ...call.input,
  } as DesignAction
}

export class GoogleAiProvider implements AiProvider {
  readonly name = "google" as const
  private readonly apiKey = getGoogleAiApiKey()

  async generateDesignActions(
    input: GenerateDesignActionsInput
  ): Promise<GenerateDesignActionsResult> {
    const google = createGoogleGenerativeAI({ apiKey: this.apiKey })
    const canvasContext =
      input.currentCanvas.nodes.length > 0
        ? `Canvas has ${input.currentCanvas.nodes.length} existing node(s). Current state:\n${JSON.stringify(input.currentCanvas, null, 2)}\nExtend or modify based on the request; only clear if explicitly asked.`
        : "The canvas is currently empty; create a fresh design."

    const result = await generateText({
      model: google(getGoogleDesignModel()),
      system: buildSystemPrompt(),
      prompt: `User request: ${input.prompt}\n\n${canvasContext}`,
      tools: canvasTools,
      toolChoice: "required",
    })

    const toolCalls = result.steps.flatMap((step) => step.toolCalls) as ToolCall[]
    const actions = toolCalls.flatMap((call) => {
      const action = toolCallToAction(call)
      return action ? [action] : []
    })
    const finalizeCall = toolCalls.find((call) => call.toolName === "finalizeDesign")
    const summary =
      (finalizeCall?.input as { summary?: string } | undefined)?.summary ??
      "Design applied to canvas."

    return validateDesignProviderResult({ actions, summary })
  }

  async generateSpecMarkdown(input: GenerateSpecMarkdownInput): Promise<string> {
    const google = createGoogleGenerativeAI({ apiKey: this.apiKey })
    const result = await generateText({
      model: google(getGoogleSpecModel()),
      system: SPEC_SYSTEM_PROMPT,
      prompt: buildSpecContext(input.nodes, input.edges, input.chatHistory),
    })

    return z.string().min(1).parse(result.text)
  }

  async generateArchitectureDraft(
    input: GenerateArchitectureDraftInput
  ): Promise<GenerateArchitectureDraftResult> {
    const google = createGoogleGenerativeAI({ apiKey: this.apiKey })
    const result = await generateObject({
      model: google(getGoogleDesignModel()),
      schema: ArchitectureDraftProposalSchema,
      system: buildArchitectureDraftSystemPrompt(),
      prompt: buildArchitectureDraftUserPrompt(input),
    })

    return parseArchitectureDraftProposal(result.object)
  }
}
