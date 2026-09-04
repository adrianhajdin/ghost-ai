import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import {
  AI_PROVIDER_DEFINITIONS,
  AI_PROVIDER_IDS,
  type AiProviderId,
} from "@/types/ai"

export { AI_PROVIDER_DEFINITIONS, AI_PROVIDER_IDS }
export type { AiProviderId }

export type AiAgentId = AiProviderId
export type AiTask = "design" | "spec"

export interface AiAgentInfo {
  id: AiProviderId
  label: string
  model: string
  isLocal: boolean
}

export interface AiProviderSettings {
  provider: AiProviderId
  model: string
  baseUrl?: string
  apiKey?: string
  headers?: Record<string, string>
}

const AGENT_ALIASES: Record<string, AiProviderId> = {
  local: "ollama",
  ollama: "ollama",
  lmstudio: "lmstudio",
  "lm-studio": "lmstudio",
  openai: "openai",
  anthropic: "anthropic",
  claude: "anthropic",
  openrouter: "openrouter",
  "open-router": "openrouter",
  azure: "azure",
  "azure-openai": "azure",
  "azure-foundry": "azure",
  custom: "custom",
  "openai-compatible": "custom",
}

const DEFAULT_AGENT: AiProviderId = "ollama"

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value || undefined
}

function getAgentId(task: AiTask): AiProviderId {
  const taskAgent = task === "design" ? readEnv("AI_DESIGN_AGENT") : readEnv("AI_SPEC_AGENT")
  const configured = taskAgent ?? readEnv("AI_AGENT") ?? readEnv("AI_PROVIDER") ?? DEFAULT_AGENT
  const agentId = AGENT_ALIASES[configured.toLowerCase()]

  if (!agentId) {
    throw new Error(
      `Unsupported AI agent "${configured}". Use one of: ${AI_PROVIDER_IDS.join(", ")}.`
    )
  }

  return agentId
}

function getModel(task: AiTask, provider: AiProviderId): string {
  const taskModel = task === "design" ? readEnv("AI_DESIGN_MODEL") : readEnv("AI_SPEC_MODEL")
  const modelEnv = {
    ollama: "OLLAMA_MODEL",
    lmstudio: "LM_STUDIO_MODEL",
    openai: "OPENAI_MODEL",
    anthropic: "ANTHROPIC_MODEL",
    openrouter: "OPENROUTER_MODEL",
    azure: "AZURE_OPENAI_MODEL",
    custom: "AI_CUSTOM_MODEL",
  }[provider]

  return taskModel ?? readEnv("AI_MODEL") ?? readEnv(modelEnv) ?? AI_PROVIDER_DEFINITIONS[provider].defaultModel
}

function requireValue(value: string | undefined, message: string): string {
  if (!value) {
    throw new Error(message)
  }
  return value
}

function requireUrl(value: string | undefined, message: string): string {
  if (!value) {
    throw new Error(message)
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${message} must be a valid URL.`)
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${message} must use HTTP or HTTPS.`)
  }

  return value.replace(/\/+$/, "")
}

function createCompatibleModel(
  agent: AiAgentInfo,
  baseURL: string,
  apiKey?: string,
  headers?: Record<string, string>
) {
  const provider = createOpenAICompatible({
    name: agent.id,
    baseURL,
    ...(apiKey ? { apiKey } : {}),
    ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
  })

  return provider.chatModel(agent.model)
}

function createAzureModel(agent: AiAgentInfo, baseUrl: string, apiKey: string) {
  const provider = createOpenAI({
    name: "azure",
    baseURL: baseUrl,
    apiKey: "azure-api-key",
    headers: { "api-key": apiKey },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers)
      headers.delete("Authorization")
      headers.set("api-key", apiKey)
      return globalThis.fetch(input, { ...init, headers })
    },
  })

  return provider.chat(agent.model)
}

export function getAiAgentInfo(task: AiTask): AiAgentInfo {
  const agentId = getAgentId(task)
  const definition = AI_PROVIDER_DEFINITIONS[agentId]

  return {
    id: definition.id,
    label: definition.label,
    model: getModel(task, agentId),
    isLocal: definition.isLocal,
  }
}

export function getAiAgentInfoFromConfig(config: AiProviderSettings): AiAgentInfo {
  const definition = AI_PROVIDER_DEFINITIONS[config.provider]
  return {
    id: config.provider,
    label: definition.label,
    model: config.model,
    isLocal: definition.isLocal,
  }
}

export function getAiModelFromConfig(config: AiProviderSettings) {
  const agent = getAiAgentInfoFromConfig(config)

  if (!agent.model.trim()) {
    throw new Error(`${agent.label} requires a model name.`)
  }

  switch (config.provider) {
    case "ollama":
      return createCompatibleModel(
        agent,
        requireUrl(
          config.baseUrl ?? AI_PROVIDER_DEFINITIONS.ollama.defaultBaseUrl,
          `${agent.label} base URL`
        ),
        config.apiKey
      )
    case "lmstudio":
      return createCompatibleModel(
        agent,
        requireUrl(
          config.baseUrl ?? AI_PROVIDER_DEFINITIONS.lmstudio.defaultBaseUrl,
          `${agent.label} base URL`
        ),
        config.apiKey
      )
    case "openai": {
      const provider = createOpenAI({
        apiKey: requireValue(config.apiKey, `${agent.label} requires an API key.`),
      })
      return provider(agent.model)
    }
    case "anthropic": {
      const provider = createAnthropic({
        apiKey: requireValue(config.apiKey, `${agent.label} requires an API key.`),
      })
      return provider(agent.model)
    }
    case "openrouter":
      return createCompatibleModel(
        agent,
        "https://openrouter.ai/api/v1",
        requireValue(config.apiKey, `${agent.label} requires an API key.`),
        config.headers
      )
    case "azure":
      return createAzureModel(
        agent,
        requireUrl(config.baseUrl, `${agent.label} requires a base URL`),
        requireValue(config.apiKey, `${agent.label} requires an API key.`)
      )
    case "custom":
      return createCompatibleModel(
        agent,
        requireUrl(config.baseUrl, `${agent.label} requires a base URL`),
        config.apiKey
      )
  }
}

export function getAiModel(task: AiTask) {
  const agent = getAiAgentInfo(task)
  const baseUrls: Partial<Record<AiProviderId, string | undefined>> = {
    ollama: readEnv("OLLAMA_BASE_URL"),
    lmstudio: readEnv("LM_STUDIO_BASE_URL"),
    azure: readEnv("AZURE_OPENAI_BASE_URL"),
    custom: readEnv("AI_BASE_URL"),
  }
  const apiKeys: Partial<Record<AiProviderId, string | undefined>> = {
    ollama: readEnv("OLLAMA_API_KEY"),
    lmstudio: readEnv("LM_STUDIO_API_KEY"),
    openai: readEnv("OPENAI_API_KEY"),
    anthropic: readEnv("ANTHROPIC_API_KEY"),
    openrouter: readEnv("OPENROUTER_API_KEY"),
    azure: readEnv("AZURE_OPENAI_API_KEY"),
    custom: readEnv("AI_API_KEY"),
  }

  return getAiModelFromConfig({
    provider: agent.id,
    model: agent.model,
    baseUrl: baseUrls[agent.id],
    apiKey: apiKeys[agent.id],
    headers:
      agent.id === "openrouter"
        ? {
            ...(readEnv("OPENROUTER_HTTP_REFERER")
              ? { "HTTP-Referer": readEnv("OPENROUTER_HTTP_REFERER")! }
              : {}),
            ...(readEnv("OPENROUTER_APP_NAME")
              ? { "X-Title": readEnv("OPENROUTER_APP_NAME")! }
              : {}),
          }
        : undefined,
  })
}
