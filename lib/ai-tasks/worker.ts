import { AiTaskType, type AiTaskRun } from "@/app/generated/prisma/client"
import {
  GenerateSpecPayloadSchema,
  runGenerateSpecTask,
} from "@/lib/ai-tasks/task-handlers/generate-spec-handler"
import {
  ArchitectureDraftPayloadSchema,
  runArchitectureDraftTask,
} from "@/lib/ai-tasks/task-handlers/architecture-draft-handler"
import {
  PromptPackPayloadSchema,
  runPromptPackTask,
} from "@/lib/ai-tasks/task-handlers/prompt-pack-handler"
import {
  ArchitectConversationPayloadSchema,
  runArchitectConversationTask,
} from "@/lib/ai-tasks/task-handlers/architect-conversation-handler"
import {
  appendAiTaskEvent,
  getSafeWorkerError,
  heartbeatTask,
  leaseNextTask,
  markFailed,
  markRetrying,
  markSucceeded,
  taskTypeLabel,
} from "@/lib/ai-tasks/task-service"
import { AI_TASK_LEASE_SECONDS } from "@/lib/ai-tasks/types"

const DEFAULT_POLL_INTERVAL_MS = 2000
const HEARTBEAT_INTERVAL_MS = Math.max(
  5000,
  Math.floor((AI_TASK_LEASE_SECONDS * 1000) / 3)
)

export interface AiWorkerOptions {
  pollIntervalMs?: number
  once?: boolean
  signal?: AbortSignal
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }

    const timeoutId = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeoutId)
        resolve()
      },
      { once: true }
    )
  })
}

async function runHandler(run: AiTaskRun) {
  switch (run.type) {
    case AiTaskType.generate_spec: {
      const payload = GenerateSpecPayloadSchema.parse(run.payloadJson)
      return runGenerateSpecTask(payload)
    }
    case AiTaskType.architecture_draft: {
      const payload = ArchitectureDraftPayloadSchema.parse(run.payloadJson)
      return runArchitectureDraftTask(payload)
    }
    case AiTaskType.prompt_pack: {
      const payload = PromptPackPayloadSchema.parse(run.payloadJson)
      return runPromptPackTask(payload)
    }
    case AiTaskType.architect_conversation: {
      const payload = ArchitectConversationPayloadSchema.parse(run.payloadJson)
      return runArchitectConversationTask(payload, run.id)
    }
    default: {
      const exhaustive: never = run.type
      throw new Error(`Unsupported AI task type: ${exhaustive}`)
    }
  }
}

async function executeLeasedTask(run: AiTaskRun) {
  console.info(`[ai-worker] Running ${taskTypeLabel(run.type)} task ${run.id}`)

  const heartbeatId = setInterval(() => {
    heartbeatTask(run.id).catch((error: unknown) => {
      console.warn(`[ai-worker] Heartbeat failed for ${run.id}`, {
        message: getSafeWorkerError(error),
      })
    })
  }, HEARTBEAT_INTERVAL_MS)

  try {
    await appendAiTaskEvent({
      taskRunId: run.id,
      type: "handler_started",
      message: `${taskTypeLabel(run.type)} handler started.`,
    })

    const result = await runHandler(run)
    await markSucceeded(run.id, result)

    console.info(`[ai-worker] Task ${run.id} succeeded`)
  } catch (error) {
    const safeError = getSafeWorkerError(error)

    if (run.attemptCount < run.maxAttempts) {
      await markRetrying(run.id, safeError)
      console.warn(`[ai-worker] Task ${run.id} will retry`, {
        attempt: run.attemptCount,
        maxAttempts: run.maxAttempts,
        message: safeError,
      })
    } else {
      await markFailed(run.id, safeError)
      console.warn(`[ai-worker] Task ${run.id} failed`, {
        attempt: run.attemptCount,
        maxAttempts: run.maxAttempts,
        message: safeError,
      })
    }
  } finally {
    clearInterval(heartbeatId)
  }
}

export async function runAiWorker(options: AiWorkerOptions = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  console.info("[ai-worker] Started")

  while (!options.signal?.aborted) {
    try {
      const run = await leaseNextTask()

      if (run) {
        await executeLeasedTask(run)
        if (options.once) return
        continue
      }
    } catch (error) {
      console.error("[ai-worker] Worker loop error", {
        message: getSafeWorkerError(error),
      })
    }

    if (options.once) return
    await sleep(pollIntervalMs, options.signal)
  }

  console.info("[ai-worker] Stopped")
}
