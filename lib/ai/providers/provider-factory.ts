import { GoogleAiProvider } from "@/lib/ai/providers/google-provider"
import { MockAiProvider } from "@/lib/ai/providers/mock-provider"
import { OpenAiCompatibleProvider } from "@/lib/ai/providers/openai-compatible-provider"
import {
  AiProviderConfigError,
  type AiProvider,
  type AiProviderName,
  type SafeAiProviderMetadata,
} from "@/lib/ai/providers/types"

export function getAiProviderName(): AiProviderName {
  const configured = process.env.AI_PROVIDER?.trim()
  if (!configured) return "mock"

  if (
    configured === "mock" ||
    configured === "google" ||
    configured === "openai_compatible"
  ) {
    return configured
  }

  throw new AiProviderConfigError(
    "AI_PROVIDER must be one of mock, google, or openai_compatible."
  )
}

export function getSafeAiProviderMetadata(
  providerName: AiProviderName = getAiProviderName()
): SafeAiProviderMetadata {
  return {
    providerName,
    isMockProvider: providerName === "mock",
  }
}

export function getAiProvider(): AiProvider {
  const providerName = getAiProviderName()

  switch (providerName) {
    case "mock":
      return new MockAiProvider()
    case "google":
      return new GoogleAiProvider()
    case "openai_compatible":
      return new OpenAiCompatibleProvider()
  }
}
