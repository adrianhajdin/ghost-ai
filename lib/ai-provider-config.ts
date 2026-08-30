import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"
import {
  AI_PROVIDER_DEFINITIONS,
  type AiProviderId,
  type AiProviderSummary,
} from "@/types/ai"
import type { AiProviderSettings } from "@/lib/ai-provider"

const ENCRYPTION_ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const PROVIDER_TO_DATABASE = {
  ollama: "OLLAMA",
  lmstudio: "LMSTUDIO",
  openai: "OPENAI",
  anthropic: "ANTHROPIC",
  openrouter: "OPENROUTER",
  custom: "CUSTOM",
} as const
const DATABASE_TO_PROVIDER: Record<string, AiProviderId> = {
  OLLAMA: "ollama",
  LMSTUDIO: "lmstudio",
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  OPENROUTER: "openrouter",
  CUSTOM: "custom",
}

export const aiProviderConfigSelect = {
  id: true,
  projectId: true,
  name: true,
  provider: true,
  model: true,
  baseUrl: true,
  encryptedApiKey: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} as const

export type StoredAiProviderConfig = {
  id: string
  projectId: string
  name: string
  provider: string
  model: string
  baseUrl: string | null
  encryptedApiKey: string | null
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

export function toDatabaseProvider(provider: AiProviderId) {
  return PROVIDER_TO_DATABASE[provider]
}

export function fromDatabaseProvider(value: string): AiProviderId {
  const provider = DATABASE_TO_PROVIDER[value]
  if (!provider) {
    throw new Error(`Unsupported stored AI provider "${value}".`)
  }

  return provider
}

export function normalizeProviderBaseUrl(value?: string): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null
  }
  if (url.username || url.password) {
    return null
  }

  return trimmed.replace(/\/+$/, "")
}

export function getProviderConfigError(input: {
  provider: AiProviderId
  model: string
  baseUrl: string | null
  hasApiKey: boolean
}): string | null {
  const definition = AI_PROVIDER_DEFINITIONS[input.provider]

  if (!input.model.trim()) {
    return `${definition.label} requires a model name.`
  }

  if (input.baseUrl && !definition.isLocal && input.provider !== "custom") {
    return "Custom base URLs are only supported for local or custom providers."
  }

  if (input.provider === "custom" && !input.baseUrl) {
    return "Custom OpenAI-compatible providers require a base URL."
  }

  if (definition.requiresApiKey && !input.hasApiKey) {
    return `${definition.label} requires an API key.`
  }

  return null
}

export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.AI_CONFIG_ENCRYPTION_KEY?.trim())
}

function getEncryptionKey(): Buffer {
  const secret = process.env.AI_CONFIG_ENCRYPTION_KEY?.trim()
  if (!secret) {
    throw new Error("AI_CONFIG_ENCRYPTION_KEY is required to manage provider credentials.")
  }

  return createHash("sha256").update(secret).digest()
}

export function encryptApiKey(apiKey: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [iv, authTag, ciphertext].map((part) => part.toString("base64url")).join(".")
}

export function decryptApiKey(payload: string): string {
  const [ivValue, authTagValue, ciphertextValue] = payload.split(".")
  if (!ivValue || !authTagValue || !ciphertextValue) {
    throw new Error("Stored AI provider credential is malformed.")
  }

  const decipher = createDecipheriv(
    ENCRYPTION_ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url")
  )
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"))

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    throw new Error("Stored AI provider credential could not be decrypted.")
  }
}

export function toAiProviderSettings(
  config: Pick<StoredAiProviderConfig, "provider" | "model" | "baseUrl" | "encryptedApiKey">
): AiProviderSettings {
  const provider = fromDatabaseProvider(config.provider)

  return {
    provider,
    model: config.model,
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    ...(config.encryptedApiKey ? { apiKey: decryptApiKey(config.encryptedApiKey) } : {}),
  }
}

export function toAiProviderSummary(
  config: Pick<
    StoredAiProviderConfig,
    "id" | "name" | "provider" | "model" | "baseUrl" | "encryptedApiKey" | "isDefault" | "createdAt" | "updatedAt"
  >
): AiProviderSummary {
  const provider = fromDatabaseProvider(config.provider)

  return {
    id: config.id,
    name: config.name,
    provider,
    model: config.model,
    baseUrl: config.baseUrl,
    isDefault: config.isDefault,
    hasApiKey: Boolean(config.encryptedApiKey),
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  }
}

export async function getProjectAiProviderConfig(
  projectId: string,
  providerConfigId?: string
) {
  return prisma.aiProviderConfig.findFirst({
    where: providerConfigId
      ? { id: providerConfigId, projectId }
      : { projectId, isDefault: true },
    select: aiProviderConfigSelect,
  })
}
