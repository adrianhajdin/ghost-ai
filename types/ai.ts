export const AI_PROVIDER_IDS = [
  "ollama",
  "lmstudio",
  "openai",
  "anthropic",
  "openrouter",
  "azure",
  "custom",
] as const

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number]

export interface AiProviderDefinition {
  id: AiProviderId
  label: string
  description: string
  defaultModel: string
  defaultBaseUrl?: string
  isLocal: boolean
  requiresApiKey: boolean
}

export const AI_PROVIDER_DEFINITIONS: Record<AiProviderId, AiProviderDefinition> = {
  ollama: {
    id: "ollama",
    label: "Ollama",
    description: "Run an open model on this machine.",
    defaultModel: "llama3.2",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    isLocal: true,
    requiresApiKey: false,
  },
  lmstudio: {
    id: "lmstudio",
    label: "LM Studio",
    description: "Use a local model served by LM Studio.",
    defaultModel: "local-model",
    defaultBaseUrl: "http://127.0.0.1:1234/v1",
    isLocal: true,
    requiresApiKey: false,
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    description: "Use OpenAI-hosted models.",
    defaultModel: "gpt-4o-mini",
    isLocal: false,
    requiresApiKey: true,
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    description: "Use Claude models hosted by Anthropic.",
    defaultModel: "claude-3-5-sonnet-latest",
    isLocal: false,
    requiresApiKey: true,
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    description: "Route requests through multiple cloud model providers.",
    defaultModel: "openai/gpt-4o-mini",
    isLocal: false,
    requiresApiKey: true,
  },
  azure: {
    id: "azure",
    label: "Azure OpenAI / Foundry",
    description: "Use an Azure-hosted OpenAI-compatible deployment.",
    defaultModel: "gpt-4.1-nano",
    isLocal: false,
    requiresApiKey: true,
  },
  custom: {
    id: "custom",
    label: "Custom OpenAI-compatible",
    description: "Connect any compatible gateway or self-hosted endpoint.",
    defaultModel: "",
    isLocal: false,
    requiresApiKey: false,
  },
}

export interface AiProviderSummary {
  id: string
  name: string
  provider: AiProviderId
  model: string
  baseUrl: string | null
  isDefault: boolean
  hasApiKey: boolean
  createdAt: string
  updatedAt: string
}
