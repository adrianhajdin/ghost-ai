import { prisma } from "@/lib/prisma"
import { getCurrentProjectIdentity } from "@/lib/project-access"
import { aiProviderConfigUpdateSchema } from "@/lib/ai-schemas"
import {
  aiProviderConfigSelect,
  encryptApiKey,
  fromDatabaseProvider,
  getProviderConfigError,
  isEncryptionConfigured,
  normalizeProviderBaseUrl,
  toAiProviderSummary,
  toDatabaseProvider,
} from "@/lib/ai-provider-config"

export const runtime = "nodejs"

interface RouteContext {
  params: Promise<{ projectId: string; providerConfigId: string }>
}

async function getOwnedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
    select: { id: true },
  })
}

export async function PATCH(request: Request, ctx: RouteContext) {
  const identity = await getCurrentProjectIdentity()
  if (!identity.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { projectId, providerConfigId } = await ctx.params
  const project = await getOwnedProject(projectId, identity.userId)
  if (!project) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  const existing = await prisma.aiProviderConfig.findFirst({
    where: { id: providerConfigId, projectId },
    select: aiProviderConfigSelect,
  })
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = aiProviderConfigUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Invalid provider configuration" }, { status: 400 })
  }

  const input = parsed.data
  if (input.apiKey && input.clearApiKey) {
    return Response.json({ error: "Choose an API key or clear the existing key" }, { status: 400 })
  }

  const provider = input.provider ?? fromDatabaseProvider(existing.provider)
  const model = input.model ?? existing.model
  const baseUrl =
    input.baseUrl === undefined
      ? existing.baseUrl
      : normalizeProviderBaseUrl(input.baseUrl)

  if (input.baseUrl && !baseUrl) {
    return Response.json({ error: "Base URL must use HTTP or HTTPS" }, { status: 400 })
  }

  const hasApiKey = input.apiKey
    ? true
    : input.clearApiKey
      ? false
      : Boolean(existing.encryptedApiKey)
  const configError = getProviderConfigError({
    provider,
    model,
    baseUrl,
    hasApiKey,
  })
  if (configError) {
    return Response.json({ error: configError }, { status: 400 })
  }
  if (input.apiKey && !isEncryptionConfigured()) {
    return Response.json(
      { error: "AI provider encryption is not configured on the server" },
      { status: 503 }
    )
  }

  if (input.name && input.name !== existing.name) {
    const duplicate = await prisma.aiProviderConfig.findUnique({
      where: { projectId_name: { projectId, name: input.name } },
      select: { id: true },
    })
    if (duplicate) {
      return Response.json({ error: "A provider with that name already exists" }, { status: 409 })
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const isDefault = input.isDefault ?? existing.isDefault

    if (isDefault) {
      await tx.aiProviderConfig.updateMany({
        where: { projectId },
        data: { isDefault: false },
      })
    }

    return tx.aiProviderConfig.update({
      where: { id: providerConfigId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        provider: toDatabaseProvider(provider),
        model,
        baseUrl,
        ...(input.apiKey
          ? { encryptedApiKey: encryptApiKey(input.apiKey) }
          : input.clearApiKey
            ? { encryptedApiKey: null }
            : {}),
        isDefault,
      },
      select: aiProviderConfigSelect,
    })
  })

  return Response.json({ provider: toAiProviderSummary(updated) })
}

export async function DELETE(_request: Request, ctx: RouteContext) {
  const identity = await getCurrentProjectIdentity()
  if (!identity.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { projectId, providerConfigId } = await ctx.params
  const project = await getOwnedProject(projectId, identity.userId)
  if (!project) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const config = await tx.aiProviderConfig.findFirst({
      where: { id: providerConfigId, projectId },
      select: { id: true, isDefault: true },
    })
    if (!config) return null

    await tx.aiProviderConfig.delete({ where: { id: config.id } })

    if (config.isDefault) {
      const replacement = await tx.aiProviderConfig.findFirst({
        where: { projectId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
      if (replacement) {
        await tx.aiProviderConfig.update({
          where: { id: replacement.id },
          data: { isDefault: true },
        })
      }
    }

    return config
  })

  if (!deleted) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  return new Response(null, { status: 204 })
}
