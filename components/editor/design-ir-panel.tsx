"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Clipboard, Download, FileJson, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface DesignIrPanelProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface DesignIrApiResponse {
  ir: {
    scope?: {
      compiledGraphIds?: string[]
    }
    validationSummary?: {
      status?: string
      errors?: number
      warnings?: number
      info?: number
    }
  }
  validation: unknown[]
  status: "valid" | "has-warnings" | "draft"
  graphCount: number
  summary?: string
}

function statusClasses(status: DesignIrApiResponse["status"]) {
  if (status === "valid") {
    return "border-state-success/40 bg-state-success/10 text-state-success"
  }
  if (status === "has-warnings") {
    return "border-state-warning/40 bg-state-warning/10 text-state-warning"
  }
  return "border-accent-primary/35 bg-accent-primary-dim text-accent-primary"
}

async function writeClipboardText(text: string) {
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.left = "-9999px"
  textarea.style.top = "0"
  document.body.appendChild(textarea)
  textarea.focus({ preventScroll: true })
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  try {
    if (document.execCommand("copy")) return true
  } finally {
    document.body.removeChild(textarea)
  }

  if (navigator.clipboard?.writeText) {
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => {
          window.setTimeout(() => reject(new Error("Clipboard write timed out")), 300)
        }),
      ])
      return true
    } catch {
      // Fall back for embedded browser contexts that deny async clipboard writes.
    }
  }
  return false
}

export function DesignIrPanel({ projectId, open, onOpenChange }: DesignIrPanelProps) {
  const [data, setData] = useState<DesignIrApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const jsonPreview = useMemo(() => (data ? JSON.stringify(data.ir, null, 2) : ""), [data])
  const compiledGraphIds = data?.ir.scope?.compiledGraphIds ?? []

  const loadDesignIr = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    setCopied(false)

    try {
      const response = await fetch(`/api/projects/${projectId}/design-ir?format=json`, {
        cache: "no-store",
        signal,
      })
      if (!response.ok) throw new Error("Design IR export failed")
      const payload = (await response.json()) as DesignIrApiResponse
      if (!signal?.aborted) setData(payload)
    } catch (loadError) {
      if (signal?.aborted) return
      setData(null)
      setError(loadError instanceof Error ? loadError.message : "Design IR export failed")
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    queueMicrotask(() => {
      void loadDesignIr(controller.signal)
    })
    return () => controller.abort()
  }, [loadDesignIr, open])

  async function handleCopy() {
    if (!jsonPreview) return
    const copiedToClipboard = await writeClipboardText(jsonPreview)
    if (!copiedToClipboard) {
      setError("Copy failed. Download the JSON instead.")
      return
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  function handleDownload() {
    const a = document.createElement("a")
    a.href = `/api/projects/${projectId}/design-ir?format=json&download=1`
    a.download = `design-ir-${projectId}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[calc(100vh-1rem)] max-w-[calc(100%-1rem)] gap-0 overflow-hidden rounded-3xl border border-border-default bg-bg-surface p-0 text-text-primary shadow-2xl ring-1 ring-accent-primary/10 sm:max-w-3xl lg:max-w-4xl"
      >
        <DialogHeader className="border-b border-border-default px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3 pr-8">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-accent-primary/25 bg-accent-primary-dim">
              <FileJson className="h-4 w-4 text-accent-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-sm font-semibold text-text-primary">
                Design IR
              </DialogTitle>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                Design IR is the machine-readable architecture model. AI Prompt Packs use the canvas pyramid.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 gap-0 md:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="border-b border-border-default bg-bg-elevated/40 p-4 md:border-b-0 md:border-r">
            {data ? (
              <div className="space-y-4">
                <div>
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
                      statusClasses(data.status)
                    )}
                  >
                    {data.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 md:grid-cols-1">
                  <div className="rounded-xl border border-border-subtle bg-bg-surface p-3">
                    <p className="text-[10px] uppercase tracking-[0.08em] text-text-faint">Graphs</p>
                    <p className="mt-1 text-lg font-semibold text-text-primary">{data.graphCount}</p>
                  </div>
                  <div className="rounded-xl border border-border-subtle bg-bg-surface p-3">
                    <p className="text-[10px] uppercase tracking-[0.08em] text-text-faint">Warnings</p>
                    <p className="mt-1 text-lg font-semibold text-text-primary">
                      {data.ir.validationSummary?.warnings ?? 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border-subtle bg-bg-surface p-3">
                    <p className="text-[10px] uppercase tracking-[0.08em] text-text-faint">Errors</p>
                    <p className="mt-1 text-lg font-semibold text-text-primary">
                      {data.ir.validationSummary?.errors ?? 0}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[10px] uppercase tracking-[0.08em] text-text-faint">
                    Compiled Graphs
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {compiledGraphIds.map((graphId) => (
                      <span
                        key={graphId}
                        className="max-w-full truncate rounded-lg border border-border-subtle bg-bg-surface px-2 py-1 font-mono text-[11px] text-text-secondary"
                      >
                        {graphId}
                      </span>
                    ))}
                  </div>
                </div>

                {data.summary ? (
                  <p className="rounded-xl border border-border-subtle bg-bg-surface p-3 text-xs leading-relaxed text-text-secondary">
                    {data.summary}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-border-subtle bg-bg-surface p-3 text-xs text-text-muted">
                {loading ? "Compiling Design IR..." : "Design IR is not loaded yet."}
              </div>
            )}
          </aside>

          <section className="flex min-h-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-default px-4 py-3">
              <p className="text-xs text-text-muted">
                {data ? `${data.validation.length} validation results` : "Read-only export preview"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-lg border-border-subtle text-xs"
                  onClick={() => void loadDesignIr()}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Refresh
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-lg border-border-subtle text-xs"
                  onClick={handleCopy}
                  disabled={!data}
                >
                  <Clipboard className="h-3.5 w-3.5" />
                  {copied ? "Copied" : "Copy JSON"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-lg border-border-subtle text-xs"
                  onClick={handleDownload}
                  disabled={!data}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            </div>

            <ScrollArea className="max-h-[58vh] min-h-[18rem] bg-bg-base">
              {loading ? (
                <div className="flex min-h-[18rem] items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-accent-primary" />
                </div>
              ) : error ? (
                <div className="p-4">
                  <p className="rounded-xl border border-state-error/30 bg-state-error/10 p-3 text-sm text-state-error">
                    {error}
                  </p>
                </div>
              ) : data ? (
                <pre className="min-w-0 overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-text-secondary">
                  {jsonPreview}
                </pre>
              ) : (
                <p className="p-4 text-sm text-text-muted">Open the panel to compile the Design IR.</p>
              )}
            </ScrollArea>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
