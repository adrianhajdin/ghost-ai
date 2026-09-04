import { prisma } from "@/lib/prisma"
import { getCurrentProjectIdentity, getAccessibleProject } from "@/lib/project-access"
import {
  aiProviderConfigCreateSchema,
} from "@/lib/ai-schemas"
import {
  aiProviderConfigSelect,
  encryptApiKey,
  getProviderConfigError,
  isEncryptionConfigured,
  normalizeProviderBaseUrl,
  toAiProviderSummary,
  toDatabaseProvider,
} from "@/lib/ai-provider-config"

export const runtime = "nodejs"

interface RouteContext {
  params: Promise<{ projectId: string }>
}

export async function GET(_request: Request, ctx: RouteContext) {
  const identity = await getCurrentProjectIdentity()
  if (!identity.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { projectId } = await ctx.params
  const project = await getAccessibleProject(projectId, identity)
  if (!project) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  const configs = await prisma.aiProviderConfig.findMany({
    where: { projectId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: aiProviderConfigSelect,
  })

  return Response.json({ providers: configs.map(toAiProviderSummary) })
}

export async function POST(request: Request, ctx: RouteContext) {
  const identity = await getCurrentProjectIdentity()
  if (!identity.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { projectId } = await ctx.params
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true },
  })

  if (!project) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }
  if (project.ownerId !== identity.userId) {
    return Response.json({ error: "Only the project owner can manage AI providers" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = aiProviderConfigCreateSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Invalid provider configuration" }, { status: 400 })
  }
  const input = parsed.data
  const baseUrl = normalizeProviderBaseUrl(input.baseUrl)

  if (input.baseUrl && !baseUrl) {
    return Response.json({ error: "Base URL must use HTTP or HTTPS" }, { status: 400 })
  }

  const configError = getProviderConfigError({
    provider: input.provider,
    model: input.model,
    baseUrl,
    hasApiKey: Boolean(input.apiKey),
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

  const duplicate = await prisma.aiProviderConfig.findUnique({
    where: { projectId_name: { projectId, name: input.name } },
    select: { id: true },
  })
  if (duplicate) {
    return Response.json({ error: "A provider with that name already exists" }, { status: 409 })
  }

  const created = await prisma.$transaction(async (tx) => {
    const existingCount = await tx.aiProviderConfig.count({ where: { projectId } })
    const isDefault = input.isDefault || existingCount === 0

    if (isDefault) {
      await tx.aiProviderConfig.updateMany({
        where: { projectId },
        data: { isDefault: false },
      })
    }

    return tx.aiProviderConfig.create({
      data: {
        projectId,
        name: input.name,
        provider: toDatabaseProvider(input.provider),
        model: input.model,
        baseUrl,
        encryptedApiKey: input.apiKey ? encryptApiKey(input.apiKey) : null,
        isDefault,
      },
      select: aiProviderConfigSelect,
    })
  })

  return Response.json({ provider: toAiProviderSummary(created) }, { status: 201 })
}
