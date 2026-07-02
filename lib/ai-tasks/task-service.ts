import {
  AiTaskStatus,
  type AiTaskRun,
  type AiTaskType,
  Prisma,
} from "@/app/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type { ProjectIdentity } from "@/lib/project-access"
import {
  getAccessibleProject,
  userHasProjectAccess,
} from "@/lib/project-access"
import {
  AI_TASK_LEASE_SECONDS,
  type CreateAiTaskRunInput,
  type SafeAiTaskRun,
} from "@/lib/ai-tasks/types"

const RETRY_BACKOFF_SECONDS = 10

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function toSafeAiTaskRun(run: AiTaskRun): SafeAiTaskRun {
  return {
    id: run.id,
    type: run.type,
    status: run.status,
    projectId: run.projectId,
    resultJson: run.resultJson,
    errorMessage: run.errorMessage,
    attemptCount: run.attemptCount,
    maxAttempts: run.maxAttempts,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  }
}

export async function createAiTaskRun(input: CreateAiTaskRunInput) {
  const run = await prisma.aiTaskRun.create({
    data: {
      type: input.type,
      status: AiTaskStatus.queued,
      projectId: input.projectId,
      userId: input.userId,
      payloadJson: toInputJson(input.payloadJson),
      maxAttempts: input.maxAttempts ?? 2,
      events: {
        create: {
          type: "queued",
          status: AiTaskStatus.queued,
          message: "Task queued.",
        },
      },
    },
  })

  return run
}

export async function getAiTaskRunForUser(runId: string, userId: string) {
  return prisma.aiTaskRun.findFirst({
    where: { id: runId, userId },
  })
}

export async function getAiTaskRunForProjectMember(
  runId: string,
  identity: ProjectIdentity
) {
  if (!identity.userId) return null

  const run = await prisma.aiTaskRun.findUnique({ where: { id: runId } })
  if (!run) return null
  if (run.userId === identity.userId) return run

  const hasAccess = await userHasProjectAccess(run.projectId, identity)
  return hasAccess ? run : null
}

export async function getAiTaskRunStatusForProjectMember(
  runId: string,
  identity: ProjectIdentity
) {
  const run = await getAiTaskRunForProjectMember(runId, identity)
  return run ? toSafeAiTaskRun(run) : null
}

export async function appendAiTaskEvent(input: {
  taskRunId: string
  type: string
  status?: AiTaskStatus
  message: string
  metadata?: unknown
}) {
  return prisma.aiTaskEvent.create({
    data: {
      taskRunId: input.taskRunId,
      type: input.type,
      status: input.status,
      message: input.message,
      metadata:
        input.metadata === undefined ? undefined : toInputJson(input.metadata),
    },
  })
}

export async function leaseNextTask(leaseSeconds = AI_TASK_LEASE_SECONDS) {
  // PostgreSQL SKIP LOCKED keeps multiple workers from leasing the same task.
  const rows = await prisma.$queryRaw<AiTaskRun[]>`
    WITH candidate AS (
      SELECT id
      FROM "AiTaskRun"
      WHERE (
        status IN ('queued'::"AiTaskStatus", 'retrying'::"AiTaskStatus")
        AND ("runAfter" IS NULL OR "runAfter" <= NOW())
        AND ("leaseUntil" IS NULL OR "leaseUntil" < NOW())
      ) OR (
        status = 'running'::"AiTaskStatus"
        AND "leaseUntil" < NOW()
        AND "attemptCount" < "maxAttempts"
      )
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "AiTaskRun"
    SET
      status = 'running'::"AiTaskStatus",
      "leaseUntil" = NOW() + (${leaseSeconds}::int * INTERVAL '1 second'),
      "heartbeatAt" = NOW(),
      "attemptCount" = "attemptCount" + 1,
      "updatedAt" = NOW()
    WHERE id IN (SELECT id FROM candidate)
    RETURNING *;
  `

  const run = rows[0]
  if (!run) return null

  await prisma.$transaction([
    prisma.aiTaskAttempt.create({
      data: {
        taskRunId: run.id,
        attemptNumber: run.attemptCount,
      },
    }),
    prisma.aiTaskEvent.create({
      data: {
        taskRunId: run.id,
        type: "running",
        status: AiTaskStatus.running,
        message: `Task attempt ${run.attemptCount} started.`,
      },
    }),
  ])

  return run
}

export async function heartbeatTask(taskRunId: string) {
  return prisma.aiTaskRun.updateMany({
    where: { id: taskRunId, status: AiTaskStatus.running },
    data: {
      heartbeatAt: new Date(),
      leaseUntil: new Date(Date.now() + AI_TASK_LEASE_SECONDS * 1000),
    },
  })
}

export async function markRunning(taskRunId: string) {
  await prisma.aiTaskRun.update({
    where: { id: taskRunId },
    data: {
      status: AiTaskStatus.running,
      heartbeatAt: new Date(),
      leaseUntil: new Date(Date.now() + AI_TASK_LEASE_SECONDS * 1000),
    },
  })

  await appendAiTaskEvent({
    taskRunId,
    type: "running",
    status: AiTaskStatus.running,
    message: "Task running.",
  })
}

export async function markSucceeded(taskRunId: string, resultJson: unknown) {
  const now = new Date()
  const run = await prisma.aiTaskRun.update({
    where: { id: taskRunId },
    data: {
      status: AiTaskStatus.succeeded,
      resultJson: toInputJson(resultJson),
      errorMessage: null,
      leaseUntil: null,
      heartbeatAt: now,
      completedAt: now,
    },
  })

  await prisma.$transaction([
    prisma.aiTaskAttempt.updateMany({
      where: { taskRunId, attemptNumber: run.attemptCount },
      data: { completedAt: now, errorMessage: null },
    }),
    prisma.aiTaskEvent.create({
      data: {
        taskRunId,
        type: "succeeded",
        status: AiTaskStatus.succeeded,
        message: "Task completed.",
        metadata: toInputJson(resultJson),
      },
    }),
  ])
}

export async function markFailed(taskRunId: string, errorMessage: string) {
  const now = new Date()
  const run = await prisma.aiTaskRun.update({
    where: { id: taskRunId },
    data: {
      status: AiTaskStatus.failed,
      errorMessage,
      leaseUntil: null,
      heartbeatAt: now,
      completedAt: now,
    },
  })

  await prisma.$transaction([
    prisma.aiTaskAttempt.updateMany({
      where: { taskRunId, attemptNumber: run.attemptCount },
      data: { completedAt: now, errorMessage },
    }),
    prisma.aiTaskEvent.create({
      data: {
        taskRunId,
        type: "failed",
        status: AiTaskStatus.failed,
        message: errorMessage,
      },
    }),
  ])
}

export async function markRetrying(taskRunId: string, errorMessage: string) {
  const run = await prisma.aiTaskRun.findUniqueOrThrow({
    where: { id: taskRunId },
  })
  const now = new Date()
  const retryDelayMs = Math.max(run.attemptCount, 1) * RETRY_BACKOFF_SECONDS * 1000

  await prisma.$transaction([
    prisma.aiTaskRun.update({
      where: { id: taskRunId },
      data: {
        status: AiTaskStatus.retrying,
        errorMessage,
        leaseUntil: null,
        heartbeatAt: now,
        runAfter: new Date(Date.now() + retryDelayMs),
      },
    }),
    prisma.aiTaskAttempt.updateMany({
      where: { taskRunId, attemptNumber: run.attemptCount },
      data: { completedAt: now, errorMessage },
    }),
    prisma.aiTaskEvent.create({
      data: {
        taskRunId,
        type: "retrying",
        status: AiTaskStatus.retrying,
        message: `Task will retry after a transient failure.`,
        metadata: toInputJson({ errorMessage, retryDelayMs }),
      },
    }),
  ])
}

export async function canCreateTaskForProject(
  projectId: string,
  identity: ProjectIdentity
) {
  return getAccessibleProject(projectId, identity)
}

export function getSafeWorkerError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.replace(/\s+/g, " ").slice(0, 500)
  }

  return "Task failed."
}

export function taskTypeLabel(type: AiTaskType) {
  if (type === "design_agent") return "Design agent"
  if (type === "architecture_draft") return "Architecture draft"
  return "Spec generation"
}
