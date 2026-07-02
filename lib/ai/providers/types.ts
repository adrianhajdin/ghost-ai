import type {
  GenerateDesignActionsInput,
  GenerateDesignActionsResult,
} from "@/lib/ai/design/design-provider-contract"
import type { GenerateSpecMarkdownInput } from "@/lib/ai/spec/spec-provider-contract"
import type {
  GenerateArchitectureDraftInput,
  GenerateArchitectureDraftResult,
} from "@/lib/ai/architecture-draft/architecture-draft-provider-contract"
import type {
  GeneratePromptPackInput,
  GeneratePromptPackResult,
} from "@/lib/ai/prompt-pack/prompt-pack-provider-contract"

export type AiProviderName = "mock" | "google" | "openai_compatible"

export interface AiProvider {
  readonly name: AiProviderName
  generateDesignActions(
    input: GenerateDesignActionsInput
  ): Promise<GenerateDesignActionsResult>
  generateSpecMarkdown(input: GenerateSpecMarkdownInput): Promise<string>
  generateArchitectureDraft(
    input: GenerateArchitectureDraftInput
  ): Promise<GenerateArchitectureDraftResult>
  generatePromptPack(input: GeneratePromptPackInput): Promise<GeneratePromptPackResult>
}

export class AiProviderConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiProviderConfigError"
  }
}
