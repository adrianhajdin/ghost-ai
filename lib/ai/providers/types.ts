import type { GenerateSpecMarkdownInput } from "@/lib/ai/spec/spec-provider-contract"
import type {
  GenerateArchitectureDraftInput,
  GenerateArchitectureDraftResult,
} from "@/lib/ai/architecture-draft/architecture-draft-provider-contract"
import type {
  GeneratePromptPackInput,
  GeneratePromptPackResult,
} from "@/lib/ai/prompt-pack/prompt-pack-provider-contract"
import type {
  GenerateArchitectReplyInput,
  GenerateArchitectReplyResult,
} from "@/lib/ai/architect/architect-provider-contract"

export type AiProviderName = "mock" | "google" | "openai_compatible"

export interface SafeAiProviderMetadata {
  providerName: AiProviderName
  isMockProvider: boolean
}

export interface AiProvider {
  readonly name: AiProviderName
  generateSpecMarkdown(input: GenerateSpecMarkdownInput): Promise<string>
  generateArchitectureDraft(
    input: GenerateArchitectureDraftInput
  ): Promise<GenerateArchitectureDraftResult>
  generatePromptPack(input: GeneratePromptPackInput): Promise<GeneratePromptPackResult>
  generateArchitectReply(
    input: GenerateArchitectReplyInput
  ): Promise<GenerateArchitectReplyResult>
}

export class AiProviderConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiProviderConfigError"
  }
}
