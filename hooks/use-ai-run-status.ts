"use client"

import { useEffect, useState } from "react"

export type AiRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "retrying"

export interface AiRunStatusResponse {
  id: string
  type: "generate_spec" | "architecture_draft" | "prompt_pack"
  status: AiRunStatus
  projectId: string
  resultJson: unknown
  errorMessage: string | null
  attemptCount: number
  maxAttempts: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

interface UseAiRunStatusOptions {
  enabled?: boolean
  intervalMs?: number
}

const DEFAULT_INTERVAL_MS = 1500

export function isTerminalAiRunStatus(status: AiRunStatus): boolean {
  return ["succeeded", "failed", "cancelled", "timed_out"].includes(status)
}

export function useAiRunStatus(
  runId: string | null,
  options: UseAiRunStatusOptions = {}
) {
  const enabled = options.enabled ?? Boolean(runId)
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  const [run, setRun] = useState<AiRunStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !runId) {
      return
    }

    let cancelled = false
    let timeoutId: number | null = null

    async function fetchStatus() {
      try {
        const res = await fetch(`/api/ai/runs/${runId}`)
        if (!res.ok) throw new Error("Failed to load run status")
        const data = (await res.json()) as { run: AiRunStatusResponse }
        if (cancelled) return
        setRun(data.run)
        setError(null)

        if (!isTerminalAiRunStatus(data.run.status)) {
          timeoutId = window.setTimeout(fetchStatus, intervalMs)
        }
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load run status")
        timeoutId = window.setTimeout(fetchStatus, intervalMs)
      }
    }

    void fetchStatus()

    return () => {
      cancelled = true
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [enabled, intervalMs, runId])

  return {
    run: enabled ? run : null,
    error: enabled ? error : null,
  }
}
