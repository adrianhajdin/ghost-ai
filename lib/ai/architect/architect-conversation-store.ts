import {
  ArchitectConversationRole,
  Prisma,
  type ArchitectConversationMessage,
} from "@/app/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { sanitizeLlmTransportValue } from "@/lib/canvas/canvas-pyramid"

export const ARCHITECT_RECENT_MESSAGE_LIMIT = 20

export interface SafeArchitectConversationMessage {
  id: string
  projectId: string
  graphId: string
  userId: string
  role: "user" | "assistant"
  content: string
  metadata: Prisma.JsonValue | null
  linkedRunId: string | null
  createdAt: string
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(sanitizeLlmTransportValue(value ?? null))
  ) as Prisma.InputJsonValue
}

export function sanitizeArchitectMessageContent(value: string) {
  const sanitized = sanitizeLlmTransportValue(value)
  if (typeof sanitized !== "string") return "[redacted]"
  return sanitized.trim().slice(0, 8000)
}

function toSafeMessage(
  message: ArchitectConversationMessage
): SafeArchitectConversationMessage {
  return {
    id: message.id,
    projectId: message.projectId,
    graphId: message.graphId,
    userId: message.userId,
    role: message.role,
    content: message.content,
    metadata: message.metadata,
    linkedRunId: message.linkedRunId,
    createdAt: message.createdAt.toISOString(),
  }
}

export async function createArchitectConversationMessage(input: {
  projectId: string
  graphId: string
  userId: string
  role: "user" | "assistant"
  content: string
  metadata?: unknown
  linkedRunId?: string | null
}) {
  const content = sanitizeArchitectMessageContent(input.content)
  if (!content) throw new Error("Architect conversation message is empty.")

  const message = await prisma.architectConversationMessage.create({
    data: {
      projectId: input.projectId,
      graphId: input.graphId,
      userId: input.userId,
      role:
        input.role === "assistant"
          ? ArchitectConversationRole.assistant
          : ArchitectConversationRole.user,
      content,
      metadata:
        input.metadata === undefined ? undefined : toInputJson(input.metadata),
      linkedRunId: input.linkedRunId ?? null,
    },
  })

  return toSafeMessage(message)
}

export async function listArchitectConversationMessages(input: {
  projectId: string
  graphId?: string
  scope?: "project" | "graph"
  take?: number
}) {
  const take = Math.min(
    Math.max(input.take ?? ARCHITECT_RECENT_MESSAGE_LIMIT, 1),
    100
  )
  const messages = await prisma.architectConversationMessage.findMany({
    where: {
      projectId: input.projectId,
      ...(input.scope === "graph" && input.graphId
        ? { graphId: input.graphId }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  })

  return messages.reverse().map(toSafeMessage)
}

export async function deleteArchitectConversationMessages(input: {
  projectId: string
  graphId?: string
  scope?: "project" | "graph"
}) {
  const result = await prisma.architectConversationMessage.deleteMany({
    where: {
      projectId: input.projectId,
      ...(input.scope === "graph" && input.graphId
        ? { graphId: input.graphId }
        : {}),
    },
  })

  return result.count
}

export async function getRecentArchitectMessagesForProvider(input: {
  projectId: string
  graphId?: string
  scope?: "project" | "graph"
  take?: number
}) {
  const messages = await listArchitectConversationMessages(input)
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    graphId: message.graphId,
    metadata: message.metadata,
  }))
}
