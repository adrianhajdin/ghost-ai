import { z } from "zod"
import {
  DesignProviderResultSchema,
  validateDesignProviderResult,
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
import { AiProviderConfigError, type AiProvider } from "@/lib/ai/providers/types"
import {
  parseArchitectureDraftProposal,
  type ArchitectureDraftProposal,
} from "@/lib/architecture-draft/architecture-draft"
import {
  buildArchitectureDraftSystemPrompt,
  buildArchitectureDraftUserPrompt,
  type GenerateArchitectureDraftInput,
  type GenerateArchitectureDraftResult,
} from "@/lib/ai/architecture-draft/architecture-draft-provider-contract"
import {
  buildPromptPackSystemPrompt,
  buildPromptPackUserPrompt,
  type GeneratePromptPackInput,
  type GeneratePromptPackResult,
} from "@/lib/ai/prompt-pack/prompt-pack-provider-contract"
import { parseLlmPromptPackProposal } from "@/lib/prompt-pack/llm-prompt-pack"
import { NODE_SHAPES } from "@/types/canvas"
import { AI_ASSISTANT_NAME } from "@/lib/branding"

const ChatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable(),
        }),
      })
    )
    .min(1),
})

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new AiProviderConfigError(`${name} is required when AI_PROVIDER=openai_compatible.`)
  return value
}

function normalizeBaseUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) {
    throw new AiProviderConfigError(
      "AI_BASE_URL must start with http:// or https:// when AI_PROVIDER=openai_compatible."
    )
  }

  return value.replace(/\/+$/, "")
}

function extractJsonObject(text: string) {
  const trimmed = text.trim()
  if (trimmed.startsWith("{")) return JSON.parse(trimmed) as unknown

  const first = trimmed.indexOf("{")
  const last = trimmed.lastIndexOf("}")
  if (first < 0 || last <= first) {
    throw new Error("OpenAI-compatible provider did not return JSON.")
  }

  return JSON.parse(trimmed.slice(first, last + 1)) as unknown
}

function buildDesignSystemPrompt() {
  return `You are ${AI_ASSISTANT_NAME}, an expert system architect. Return only JSON matching this TypeScript shape:
{
  "summary": "1-2 sentence summary",
  "actions": [
    { "type": "addNode", "id": "api-gateway", "label": "API Gateway", "shape": "rectangle", "colorIndex": 1, "x": 100, "y": 80 },
    { "type": "addEdge", "id": "edge-api-db", "source": "api-gateway", "target": "database", "label": "reads/writes" }
  ]
}

Allowed action types: addNode, moveNode, resizeNode, updateNode, deleteNode, addEdge, deleteEdge.
Allowed shapes: ${NODE_SHAPES.join(", ")}.
colorIndex must be an integer from 0 to 7.
When the canvas is empty, create 5-12 nodes and useful edges. When it has existing nodes, extend or modify it unless the user explicitly asks to replace it.
Do not include markdown, code fences, or commentary outside the JSON object.`
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = "openai_compatible" as const
  private readonly apiKey = requiredEnv("AI_API_KEY")
  private readonly baseUrl = normalizeBaseUrl(requiredEnv("AI_BASE_URL"))
  private readonly model = requiredEnv("AI_MODEL")
  private readonly specModel = process.env.AI_SPEC_MODEL?.trim() || this.model

  private async chatCompletion(options: {
    model: string
    messages: Array<{ role: "system" | "user"; content: string }>
    json?: boolean
  }) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: 0.2,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
    })

    if (!response.ok) {
      throw new Error(
        `OpenAI-compatible provider request failed with status ${response.status}.`
      )
    }

    const parsed = ChatCompletionResponseSchema.parse(await response.json())
    const content = parsed.choices[0].message.content
    if (!content) throw new Error("OpenAI-compatible provider returned empty content.")
    return content
  }

  async generateDesignActions(
    input: GenerateDesignActionsInput
  ): Promise<GenerateDesignActionsResult> {
    const canvasContext =
      input.currentCanvas.nodes.length > 0
        ? `Current canvas:\n${JSON.stringify(input.currentCanvas, null, 2)}`
        : "Current canvas is empty."
    const content = await this.chatCompletion({
      model: this.model,
      json: true,
      messages: [
        { role: "system", content: buildDesignSystemPrompt() },
        {
          role: "user",
          content: `User request: ${input.prompt}\n\n${canvasContext}`,
        },
      ],
    })

    const raw = extractJsonObject(content)
    return validateDesignProviderResult(DesignProviderResultSchema.parse(raw))
  }

  async generateSpecMarkdown(input: GenerateSpecMarkdownInput): Promise<string> {
    const markdown = await this.chatCompletion({
      model: this.specModel,
      messages: [
        { role: "system", content: SPEC_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildSpecContext(input.nodes, input.edges, input.chatHistory),
        },
      ],
    })

    return z.string().min(1).parse(markdown)
  }

  async generateArchitectureDraft(
    input: GenerateArchitectureDraftInput
  ): Promise<GenerateArchitectureDraftResult> {
    const content = await this.chatCompletion({
      model: this.model,
      json: true,
      messages: [
        { role: "system", content: buildArchitectureDraftSystemPrompt() },
        { role: "user", content: buildArchitectureDraftUserPrompt(input) },
      ],
    })

    return parseArchitectureDraftProposal(
      extractJsonObject(content) as ArchitectureDraftProposal
    )
  }

  async generatePromptPack(
    input: GeneratePromptPackInput
  ): Promise<GeneratePromptPackResult> {
    const content = await this.chatCompletion({
      model: this.specModel,
      json: true,
      messages: [
        { role: "system", content: buildPromptPackSystemPrompt() },
        { role: "user", content: buildPromptPackUserPrompt(input) },
      ],
    })

    return parseLlmPromptPackProposal(extractJsonObject(content))
  }
}
