import type { NextRequest } from "next/server"
import { getSafeAiProviderMetadata } from "@/lib/ai/providers/provider-factory"
import {
  ARCHITECT_RECENT_MESSAGE_LIMIT,
  deleteArchitectConversationMessages,
  listArchitectConversationMessages,
} from "@/lib/ai/architect/architect-conversation-store"
import { GraphIdError, ROOT_GRAPH_ID, graphIdFromSearchParam } from "@/lib/canvas/graph-ids"
import { getAccessibleProject, getCurrentProjectIdentity } from "@/lib/project-access"

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const identity = await getCurrentProjectIdentity(request)
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { projectId } = await ctx.params
  const project = await getAccessibleProject(projectId, identity)
  if (!project) return Response.json({ error: "Not found" }, { status: 404 })

  let graphId: string
  try {
    graphId = graphIdFromSearchParam(
      request.nextUrl.searchParams.get("graphId") ?? ROOT_GRAPH_ID
    )
  } catch (error) {
    if (error instanceof GraphIdError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    throw error
  }

  const messages = await listArchitectConversationMessages({
    projectId: project.id,
    take: ARCHITECT_RECENT_MESSAGE_LIMIT,
  })

  return Response.json({
    messages,
    currentGraphId: graphId,
    scope: "project",
    provider: getSafeAiProviderMetadata(),
  })
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const identity = await getCurrentProjectIdentity(request)
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { projectId } = await ctx.params
  const project = await getAccessibleProject(projectId, identity)
  if (!project) return Response.json({ error: "Not found" }, { status: 404 })

  let graphId: string
  try {
    graphId = graphIdFromSearchParam(
      request.nextUrl.searchParams.get("graphId") ?? ROOT_GRAPH_ID
    )
  } catch (error) {
    if (error instanceof GraphIdError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    throw error
  }

  const deletedCount = await deleteArchitectConversationMessages({
    projectId: project.id,
  })

  return Response.json({ deletedCount, currentGraphId: graphId, scope: "project" })
}
