import { generateText } from "ai"
import { prisma } from "@/lib/prisma"
import { getCurrentProjectIdentity } from "@/lib/project-access"
import { getAiModelFromConfig } from "@/lib/ai-provider"
import { toAiProviderSettings } from "@/lib/ai-provider-config"

export const runtime = "nodejs"

interface RouteContext {
  params: Promise<{ projectId: string; providerConfigId: string }>
}

export async function POST(_request: Request, ctx: RouteContext) {
  const identity = await getCurrentProjectIdentity()
  if (!identity.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { projectId, providerConfigId } = await ctx.params
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: identity.userId },
    select: { id: true },
  })
  if (!project) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  const config = await prisma.aiProviderConfig.findFirst({
    where: { id: providerConfigId, projectId },
    select: {
      provider: true,
      model: true,
      baseUrl: true,
      encryptedApiKey: true,
    },
  })
  if (!config) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const result = await generateText({
      model: getAiModelFromConfig(toAiProviderSettings(config)),
      prompt: "Reply with exactly: OK",
      maxOutputTokens: 8,
    })

    return Response.json({
      ok: true,
      response: result.text.trim().slice(0, 120),
    })
  } catch {
    return Response.json(
      { error: "Provider test failed. Check the endpoint, model, and credentials." },
      { status: 502 }
    )
  }
}
