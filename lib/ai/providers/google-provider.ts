import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { generateObject, generateText } from "ai"
import { z } from "zod"
import { getGoogleAiApiKey } from "@/lib/ai/google-api-key"
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
import {
  buildPromptPackSystemPrompt,
  buildPromptPackUserPrompt,
  type GeneratePromptPackInput,
  type GeneratePromptPackResult,
} from "@/lib/ai/prompt-pack/prompt-pack-provider-contract"
import {
  ArchitectConversationReplySchema,
  buildArchitectSystemPrompt,
  buildArchitectUserPrompt,
  parseArchitectConversationReply,
  type GenerateArchitectReplyInput,
  type GenerateArchitectReplyResult,
} from "@/lib/ai/architect/architect-provider-contract"
import {
  LlmPromptPackProposalSchema,
  parseLlmPromptPackProposal,
} from "@/lib/prompt-pack/llm-prompt-pack"

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

export class GoogleAiProvider implements AiProvider {
  readonly name = "google" as const
  private readonly apiKey = getGoogleAiApiKey()

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

  async generatePromptPack(
    input: GeneratePromptPackInput
  ): Promise<GeneratePromptPackResult> {
    const google = createGoogleGenerativeAI({ apiKey: this.apiKey })
    const result = await generateObject({
      model: google(getGoogleSpecModel()),
      schema: LlmPromptPackProposalSchema,
      system: buildPromptPackSystemPrompt(),
      prompt: buildPromptPackUserPrompt(input),
    })

    return parseLlmPromptPackProposal(result.object)
  }

  async generateArchitectReply(
    input: GenerateArchitectReplyInput
  ): Promise<GenerateArchitectReplyResult> {
    const google = createGoogleGenerativeAI({ apiKey: this.apiKey })
    const result = await generateObject({
      model: google(getGoogleSpecModel()),
      schema: ArchitectConversationReplySchema,
      system: buildArchitectSystemPrompt(),
      prompt: buildArchitectUserPrompt(input),
    })

    return parseArchitectConversationReply(result.object)
  }
}
