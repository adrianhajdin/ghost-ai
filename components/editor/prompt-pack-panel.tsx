"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Clipboard,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type PromptPackTargetAgent = "codex" | "claude-code" | "generic-ai-builder"
type PromptPackStatus = "ready" | "has-warnings" | "draft"

interface PromptPackPanelProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface PromptPackWarning {
  id: string
  severity: "warning" | "error"
  targetKind: string
  targetId?: string
  sourceGraphId?: string
  field?: string
  message: string
}

interface PromptPackApiResponse {
  promptPack: {
    source: {
      irHash: string
      graphCount: number
    }
  }
  markdown: string
  status: PromptPackStatus
  targetAgent: PromptPackTargetAgent
  irHash: string
  warnings: PromptPackWarning[]
}

const TARGET_OPTIONS: Array<{ value: PromptPackTargetAgent; label: string }> = [
  { value: "codex", label: "Codex" },
  { value: "claude-code", label: "Claude Code" },
  { value: "generic-ai-builder", label: "Generic AI Builder" },
]

function statusClasses(status: PromptPackStatus) {
  if (status === "ready") {
    return "border-state-success/40 bg-state-success/10 text-state-success"
  }
  if (status === "has-warnings") {
    return "border-state-warning/40 bg-state-warning/10 text-state-warning"
  }
  return "border-accent-primary/35 bg-accent-primary-dim text-accent-primary"
}

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => {
          window.setTimeout(() => reject(new Error("Clipboard write timed out")), 400)
        }),
      ])
      return true
    } catch {
      // Embedded browsers may deny async clipboard writes without user activation.
    }
  }

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
    return document.execCommand("copy")
  } finally {
    document.body.removeChild(textarea)
  }
}

function downloadUrl(
  projectId: string,
  targetAgent: PromptPackTargetAgent,
  format: "json" | "markdown"
) {
  const params = new URLSearchParams({
    targetAgent,
    mode: "implementation-plan",
    format,
    download: "1",
    includeValidation: "1",
  })
  return `/api/projects/${projectId}/prompt-pack?${params.toString()}`
}

export function PromptPackPanel({ projectId, open, onOpenChange }: PromptPackPanelProps) {
  const [targetAgent, setTargetAgent] = useState<PromptPackTargetAgent>("codex")
  const [data, setData] = useState<PromptPackApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<"markdown" | "json" | null>(null)
  const jsonPreview = useMemo(
    () => (data ? JSON.stringify(data.promptPack, null, 2) : ""),
    [data]
  )

  const loadPromptPack = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    setCopied(null)

    try {
      const params = new URLSearchParams({
        targetAgent,
        mode: "implementation-plan",
        format: "json",
        includeValidation: "1",
      })
      const response = await fetch(`/api/projects/${projectId}/prompt-pack?${params.toString()}`, {
        cache: "no-store",
        signal,
      })
      if (!response.ok) throw new Error("Prompt Pack generation failed")
      const payload = (await response.json()) as PromptPackApiResponse
      if (!signal?.aborted) setData(payload)
    } catch (loadError) {
      if (signal?.aborted) return
      setData(null)
      setError(
        loadError instanceof Error ? loadError.message : "Prompt Pack generation failed"
      )
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [projectId, targetAgent])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    queueMicrotask(() => {
      void loadPromptPack(controller.signal)
    })
    return () => controller.abort()
  }, [loadPromptPack, open])

  async function handleCopy(kind: "markdown" | "json") {
    const text = kind === "markdown" ? data?.markdown : jsonPreview
    if (!text) return
    const copiedToClipboard = await writeClipboardText(text)
    if (!copiedToClipboard) {
      setError(`Copy ${kind} failed. Download still works.`)
      return
    }
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1600)
  }

  function handleDownload(format: "json" | "markdown") {
    const a = document.createElement("a")
    a.href = downloadUrl(projectId, targetAgent, format)
    a.download =
      format === "markdown"
        ? `prompt-pack-${targetAgent}-${projectId}.md`
        : `prompt-pack-${targetAgent}-${projectId}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[calc(100vh-1rem)] max-w-[calc(100%-1rem)] gap-0 overflow-hidden rounded-3xl border border-border-default bg-bg-surface p-0 text-text-primary shadow-2xl ring-1 ring-accent-primary/10 sm:max-w-4xl lg:max-w-5xl"
      >
        <DialogHeader className="border-b border-border-default px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3 pr-8">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-accent-primary/25 bg-accent-primary-dim">
              <FileText className="h-4 w-4 text-accent-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-sm font-semibold text-text-primary">
                Prompt Pack
              </DialogTitle>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                Generated instructions from Design IR. Arc Forge does not execute this pack.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 gap-0 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="border-b border-border-default bg-bg-elevated/40 p-4 lg:border-b-0 lg:border-r">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-[0.08em] text-text-faint">
                  Target
                </p>
                <div className="grid gap-2">
                  {TARGET_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={targetAgent === option.value}
                      className={cn(
                        "min-w-0 rounded-xl border px-3 py-2 text-left text-xs font-medium transition",
                        targetAgent === option.value
                          ? "border-accent-primary/45 bg-accent-primary-dim text-accent-primary"
                          : "border-border-subtle bg-bg-surface text-text-secondary hover:border-border-default hover:text-text-primary"
                      )}
                      onClick={() => setTargetAgent(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border-subtle bg-bg-surface p-3 text-xs leading-relaxed text-text-secondary">
                <p>Prompt Packs are generated from Design IR.</p>
                <p className="mt-2">No code is generated or executed by Arc Forge.</p>
                <p className="mt-2">Nimbus is not a target in this version.</p>
              </div>

              {data ? (
                <div className="space-y-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
                      statusClasses(data.status)
                    )}
                  >
                    {data.status}
                  </span>

                  <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
                    <div className="rounded-xl border border-border-subtle bg-bg-surface p-3">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-text-faint">
                        Graphs
                      </p>
                      <p className="mt-1 text-lg font-semibold text-text-primary">
                        {data.promptPack.source.graphCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border-subtle bg-bg-surface p-3">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-text-faint">
                        Warnings
                      </p>
                      <p className="mt-1 text-lg font-semibold text-text-primary">
                        {data.warnings.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border-subtle bg-bg-surface p-3">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-text-faint">
                        Mode
                      </p>
                      <p className="mt-1 truncate text-xs font-semibold text-text-primary">
                        implementation
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[10px] uppercase tracking-[0.08em] text-text-faint">
                      IR Hash
                    </p>
                    <p className="break-all rounded-xl border border-border-subtle bg-bg-base p-3 font-mono text-[11px] leading-relaxed text-text-secondary">
                      {data.irHash}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border-subtle bg-bg-surface p-3 text-xs text-text-muted">
                  {loading ? "Generating Prompt Pack..." : "Prompt Pack is not loaded yet."}
                </div>
              )}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-default px-4 py-3">
              <p className="text-xs text-text-muted">
                {data
                  ? `${data.targetAgent} pack from Design IR`
                  : "Copy or download implementation instructions"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-lg border-border-subtle text-xs"
                  onClick={() => void loadPromptPack()}
                  disabled={loading}
                  aria-label="Refresh Prompt Pack"
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
                  onClick={() => void handleCopy("markdown")}
                  disabled={!data}
                  aria-label="Copy Prompt Pack Markdown"
                >
                  <Clipboard className="h-3.5 w-3.5" />
                  {copied === "markdown" ? "Copied" : "Copy Markdown"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-lg border-border-subtle text-xs"
                  onClick={() => void handleCopy("json")}
                  disabled={!data}
                  aria-label="Copy Prompt Pack JSON"
                >
                  <Clipboard className="h-3.5 w-3.5" />
                  {copied === "json" ? "Copied" : "Copy JSON"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-lg border-border-subtle text-xs"
                  onClick={() => handleDownload("markdown")}
                  disabled={!data}
                  aria-label="Download Prompt Pack Markdown"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Markdown
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-lg border-border-subtle text-xs"
                  onClick={() => handleDownload("json")}
                  disabled={!data}
                  aria-label="Download Prompt Pack JSON"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download JSON
                </Button>
              </div>
            </div>

            <Tabs defaultValue="markdown" className="min-h-0 flex-1 gap-0 overflow-hidden">
              <TabsList className="mx-4 mt-3 h-auto w-[calc(100%-2rem)] justify-start overflow-x-auto rounded-xl bg-bg-subtle p-1">
                <TabsTrigger value="markdown" className="min-w-fit px-3 text-xs">
                  Markdown Prompt
                </TabsTrigger>
                <TabsTrigger value="json" className="min-w-fit px-3 text-xs">
                  JSON Pack
                </TabsTrigger>
                <TabsTrigger value="warnings" className="min-w-fit px-3 text-xs">
                  Warnings
                </TabsTrigger>
              </TabsList>

              <TabsContent value="markdown" className="min-h-0 overflow-hidden">
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
                    <pre className="min-w-0 overflow-x-auto whitespace-pre-wrap p-4 font-mono text-[11px] leading-relaxed text-text-secondary">
                      {data.markdown}
                    </pre>
                  ) : (
                    <p className="p-4 text-sm text-text-muted">
                      Open the panel to generate the Prompt Pack.
                    </p>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="json" className="min-h-0 overflow-hidden">
                <ScrollArea className="max-h-[58vh] min-h-[18rem] bg-bg-base">
                  {data ? (
                    <pre className="min-w-0 overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-text-secondary">
                      {jsonPreview}
                    </pre>
                  ) : (
                    <p className="p-4 text-sm text-text-muted">JSON Pack is not loaded yet.</p>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="warnings" className="min-h-0 overflow-hidden">
                <ScrollArea className="max-h-[58vh] min-h-[18rem] bg-bg-base">
                  {data?.warnings.length ? (
                    <div className="space-y-2 p-4">
                      {data.warnings.map((warning) => (
                        <div
                          key={warning.id}
                          className="rounded-xl border border-state-warning/25 bg-state-warning/10 p-3 text-xs text-text-secondary"
                        >
                          <div className="flex min-w-0 items-start gap-2">
                            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-state-warning" />
                            <div className="min-w-0">
                              <p className="font-semibold text-state-warning">
                                {warning.severity} · {warning.targetKind}
                                {warning.targetId ? `:${warning.targetId}` : ""}
                              </p>
                              <p className="mt-1 leading-relaxed">{warning.message}</p>
                              <p className="mt-1 break-all font-mono text-[10px] text-text-faint">
                                {warning.sourceGraphId ? `${warning.sourceGraphId} · ` : ""}
                                {warning.field ?? warning.id}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="p-4 text-sm text-text-muted">No Prompt Pack warnings.</p>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
