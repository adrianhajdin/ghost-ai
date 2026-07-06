"use client"

import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Clipboard,
  Download,
  FileJson,
  FileText,
  Layers,
  Loader2,
  Sparkles,
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
import type { LlmCanvasPatchPreviewResult } from "@/lib/canvas/llm-canvas-patch"

type PromptPackTargetAgent = "codex" | "claude-code" | "generic-ai-builder"
type PromptPackScopeMode = "full-project" | "current-layer" | "selected-nodes"
type AiTaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "retrying"

interface PromptPackPanelProps {
  projectId: string
  graphId: string
  selectedNodeIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface PromptPackLayerPrompt {
  graphId: string
  title: string
  markdown: string
  coveredNodeIds: string[]
}

interface PromptPackNodePrompt {
  graphId: string
  nodeId: string
  nodeLabel: string
  title: string
  markdown: string
  dependsOnNodeIds: string[]
  relatedGraphIds: string[]
}

interface CanvasImprovementProposal {
  summary: string
  operations: Array<{ op: string; [key: string]: unknown }>
  preview?: LlmCanvasPatchPreviewResult
}

interface PromptPackProposal {
  title: string
  targetAgent: PromptPackTargetAgent
  scope: {
    mode: PromptPackScopeMode
    rootGraphId: string
    currentGraphId: string
    selectedNodeIds: string[]
  }
  summary: string
  globalPrompt: {
    title: string
    markdown: string
  }
  layerPrompts: PromptPackLayerPrompt[]
  nodePrompts: PromptPackNodePrompt[]
  canvasImprovementProposal?: CanvasImprovementProposal | null
  clarificationQuestions: string[]
  assumptions: string[]
  warnings: string[]
  suggestedNextSteps: string[]
}

interface PromptPackTaskResult {
  proposal: PromptPackProposal
  markdown: string
  summary: {
    title: string
    targetAgent: PromptPackTargetAgent
    globalPromptPresent: boolean
    layerPromptCount: number
    nodePromptCount: number
    canvasImprovementOperationCount: number
    clarificationQuestionCount: number
    warningCount: number
  }
  canvasPyramidSummary?: {
    graphCount: number
    nodeCount: number
    edgeCount: number
  }
}

interface SafeAiTaskRun {
  id: string
  status: AiTaskStatus
  resultJson: unknown
  errorMessage: string | null
}

interface ApplyResult {
  applied: {
    operations: number
    updateNodes: number
    addNodes: number
    addEdges: number
    createLayers: number
    updateGraphs: number
    skippedOperations: number
  }
  issues: Array<{ operationIndex: number; severity: string; message: string }>
  dirtyGraphIds: string[]
}

const TARGET_OPTIONS: Array<{ value: PromptPackTargetAgent; label: string }> = [
  { value: "codex", label: "Codex" },
  { value: "claude-code", label: "Claude Code" },
  { value: "generic-ai-builder", label: "Generic AI Builder" },
]

const SCOPE_OPTIONS: Array<{ value: PromptPackScopeMode; label: string }> = [
  { value: "full-project", label: "Full project" },
  { value: "current-layer", label: "Current layer" },
  { value: "selected-nodes", label: "Selected node(s)" },
]

const TERMINAL_STATUSES = new Set<AiTaskStatus>([
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
])

function isPromptPackTaskResult(value: unknown): value is PromptPackTaskResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "proposal" in value &&
    "markdown" in value
  )
}

async function writeClipboardText(text: string) {
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.left = "0"
  textarea.style.top = "0"
  textarea.style.width = "1px"
  textarea.style.height = "1px"
  textarea.style.opacity = "0.01"
  textarea.style.pointerEvents = "none"
  textarea.style.zIndex = "-1"
  document.body.appendChild(textarea)
  textarea.focus({ preventScroll: true })
  textarea.select()

  try {
    if (document.execCommand("copy")) return true
  } finally {
    document.body.removeChild(textarea)
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // The embedded browser can reject async clipboard writes.
    }
  }

  return false
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function StatusPill({ status }: { status: AiTaskStatus | "idle" }) {
  const classes =
    status === "succeeded"
      ? "border-state-success/40 bg-state-success/10 text-state-success"
      : status === "failed" || status === "timed_out" || status === "cancelled"
        ? "border-state-error/40 bg-state-error/10 text-state-error"
        : status === "running" || status === "queued" || status === "retrying"
          ? "border-accent-primary/40 bg-accent-primary-dim text-accent-primary"
          : "border-border-subtle bg-bg-surface text-text-muted"

  return (
    <span className={cn("inline-flex rounded-lg border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]", classes)}>
      {status}
    </span>
  )
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[18rem] items-center justify-center p-4 text-center text-sm text-text-muted">
      {children}
    </div>
  )
}

export function PromptPackPanel({
  projectId,
  graphId,
  selectedNodeIds,
  open,
  onOpenChange,
}: PromptPackPanelProps) {
  const [targetAgent, setTargetAgent] = useState<PromptPackTargetAgent>("codex")
  const [scopeMode, setScopeMode] = useState<PromptPackScopeMode>("full-project")
  const [instructions, setInstructions] = useState("")
  const [runId, setRunId] = useState<string | null>(null)
  const [run, setRun] = useState<SafeAiTaskRun | null>(null)
  const [result, setResult] = useState<PromptPackTaskResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [activeLayerIndex, setActiveLayerIndex] = useState(0)
  const [activeNodeIndex, setActiveNodeIndex] = useState(0)
  const [applyLoading, setApplyLoading] = useState(false)
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)

  const proposal = result?.proposal ?? null
  const activeLayer = proposal?.layerPrompts[activeLayerIndex] ?? null
  const activeNode = proposal?.nodePrompts[activeNodeIndex] ?? null
  const proposalJson = useMemo(
    () => (proposal ? JSON.stringify(proposal, null, 2) : ""),
    [proposal]
  )
  const currentStatus = run?.status ?? "idle"
  const improvement = proposal?.canvasImprovementProposal ?? null
  const hasImprovements = Boolean(improvement?.operations.length)
  const improvementPreview = improvement?.preview
  const improvementCanApply = improvementPreview ? improvementPreview.canApply : hasImprovements
  const selectedScopeBlocked =
    scopeMode === "selected-nodes" && selectedNodeIds.length === 0

  useEffect(() => {
    if (!runId) return
    let cancelled = false
    let timeoutId: number | null = null

    async function poll() {
      try {
        const response = await fetch(`/api/ai/runs/${runId}`, {
          cache: "no-store",
        })
        if (!response.ok) throw new Error("Prompt Pack run status failed")
        const payload = (await response.json()) as { run: SafeAiTaskRun }
        if (cancelled) return
        setRun(payload.run)

        if (payload.run.status === "succeeded") {
          if (isPromptPackTaskResult(payload.run.resultJson)) {
            setResult(payload.run.resultJson)
            setActiveLayerIndex(0)
            setActiveNodeIndex(0)
            setApplyResult(null)
            setError(null)
          } else {
            setError("Prompt Pack task returned an unexpected result.")
          }
          setLoading(false)
          return
        }

        if (TERMINAL_STATUSES.has(payload.run.status)) {
          setError(payload.run.errorMessage ?? "Prompt Pack generation failed")
          setLoading(false)
          return
        }

        timeoutId = window.setTimeout(poll, 1500)
      } catch (pollError) {
        if (cancelled) return
        setError(pollError instanceof Error ? pollError.message : "Prompt Pack polling failed")
        setLoading(false)
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [runId])

  async function handleGenerate() {
    if (selectedScopeBlocked) {
      setError("Select at least one node before using selected-node scope.")
      return
    }

    setLoading(true)
    setError(null)
    setCopied(null)
    setApplyResult(null)
    setRun(null)
    setResult(null)

    try {
      const response = await fetch("/api/ai/prompt-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          graphId,
          targetAgent,
          scopeMode,
          selectedNodeIds,
          instructions,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        runId?: string
        error?: string
      }
      if (!response.ok || !payload.runId) {
        throw new Error(payload.error ?? "Prompt Pack generation failed")
      }
      setRunId(payload.runId)
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Prompt Pack generation failed"
      )
      setLoading(false)
    }
  }

  async function copyText(label: string, text: string | undefined) {
    if (!text) return
    const ok = await writeClipboardText(text)
    if (!ok) {
      setError(`${label} copy failed. Download still works.`)
      return
    }
    setCopied(label)
    window.setTimeout(() => setCopied(null), 1400)
  }

  async function handleApplyImprovements() {
    if (!improvement || improvement.operations.length === 0) return
    if (!improvementCanApply) return
    setApplyLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/projects/${projectId}/prompt-pack/canvas-patch/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ graphId, proposal: improvement }),
        }
      )
      const payload = (await response.json().catch(() => ({}))) as ApplyResult & {
        error?: string
      }
      if (!response.ok) throw new Error(payload.error ?? "Canvas improvement apply failed")
      setApplyResult(payload)
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : "Canvas improvement apply failed"
      )
    } finally {
      setApplyLoading(false)
    }
  }

  function handleDownload(format: "markdown" | "json") {
    if (!result) return
    if (format === "markdown") {
      downloadText(
        `ai-prompt-pack-${targetAgent}-${projectId}.md`,
        result.markdown,
        "text/markdown;charset=utf-8"
      )
      return
    }
    downloadText(
      `ai-prompt-pack-${targetAgent}-${projectId}.json`,
      proposalJson,
      "application/json;charset=utf-8"
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[calc(100vh-1rem)] max-w-[calc(100%-1rem)] gap-0 overflow-hidden rounded-lg border border-border-default bg-bg-surface p-0 text-text-primary shadow-2xl ring-1 ring-accent-primary/10 sm:max-w-5xl lg:max-w-6xl"
      >
        <DialogHeader className="border-b border-border-default px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3 pr-8">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent-primary/30 bg-accent-primary-dim">
              <Sparkles className="h-4 w-4 text-accent-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-sm font-semibold text-text-primary">
                AI Prompt Pack
              </DialogTitle>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                LLM generates Prompt Packs from the canvas pyramid. Arc Forge does not build or execute the app.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 gap-0 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="border-b border-border-default bg-bg-elevated/40 p-4 lg:border-b-0 lg:border-r">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-[0.08em] text-text-faint">
                  Target
                </p>
                <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
                  {TARGET_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={targetAgent === option.value}
                      className={cn(
                        "min-w-0 rounded-lg border px-3 py-2 text-left text-xs font-medium transition",
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

              <div>
                <p className="mb-2 text-[10px] uppercase tracking-[0.08em] text-text-faint">
                  Scope
                </p>
                <div className="grid gap-2">
                  {SCOPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={scopeMode === option.value}
                      className={cn(
                        "min-w-0 rounded-lg border px-3 py-2 text-left text-xs font-medium transition",
                        scopeMode === option.value
                          ? "border-accent-secondary/50 bg-accent-secondary/10 text-accent-secondary"
                          : "border-border-subtle bg-bg-surface text-text-secondary hover:border-border-default hover:text-text-primary"
                      )}
                      onClick={() => setScopeMode(option.value)}
                    >
                      {option.label}
                      {option.value === "selected-nodes" ? (
                        <span className="ml-2 text-text-faint">
                          {selectedNodeIds.length}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-2 block text-[10px] uppercase tracking-[0.08em] text-text-faint">
                  Extra instructions
                </span>
                <textarea
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  placeholder="Extra instructions for this prompt pack"
                  className="min-h-24 w-full resize-none rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-xs leading-relaxed text-text-primary outline-none transition placeholder:text-text-faint focus:border-accent-primary/50"
                />
              </label>

              <Button
                className="w-full gap-2 rounded-lg bg-accent-primary text-bg-base hover:bg-accent-primary/90"
                onClick={() => void handleGenerate()}
                disabled={loading || selectedScopeBlocked}
                aria-label="Generate AI Prompt Pack"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate AI Prompt Pack
              </Button>

              {selectedScopeBlocked ? (
                <div className="rounded-lg border border-state-warning/30 bg-state-warning/10 p-3 text-xs text-state-warning">
                  Select at least one node before using selected-node scope.
                </div>
              ) : null}

              <div className="rounded-lg border border-border-subtle bg-bg-surface p-3 text-xs leading-relaxed text-text-secondary">
                <p>This output is a prompt pack, not generated app code.</p>
                <p className="mt-2">Canvas improvements are previewed before apply.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={currentStatus} />
                {runId ? (
                  <span className="truncate font-mono text-[10px] text-text-faint">
                    {runId}
                  </span>
                ) : null}
              </div>

              {result?.canvasPyramidSummary ? (
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-border-subtle bg-bg-surface p-2">
                    <p className="text-[10px] text-text-faint">Graphs</p>
                    <p className="text-base font-semibold">{result.canvasPyramidSummary.graphCount}</p>
                  </div>
                  <div className="rounded-lg border border-border-subtle bg-bg-surface p-2">
                    <p className="text-[10px] text-text-faint">Nodes</p>
                    <p className="text-base font-semibold">{result.canvasPyramidSummary.nodeCount}</p>
                  </div>
                  <div className="rounded-lg border border-border-subtle bg-bg-surface p-2">
                    <p className="text-[10px] text-text-faint">Edges</p>
                    <p className="text-base font-semibold">{result.canvasPyramidSummary.edgeCount}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-default px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-text-primary">
                  {proposal?.title ?? "Generate an LLM-authored Prompt Pack"}
                </p>
                <p className="mt-1 text-[11px] text-text-muted">
                  {proposal
                    ? `${proposal.layerPrompts.length} layer prompts · ${proposal.nodePrompts.length} node prompts`
                    : "No blocking safety issues."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-lg border-border-subtle text-xs"
                  onClick={() => void copyText("full", result?.markdown)}
                  disabled={!result}
                  aria-label="Copy full Prompt Pack"
                >
                  <Clipboard className="h-3.5 w-3.5" />
                  {copied === "full" ? "Copied" : "Copy full"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-lg border-border-subtle text-xs"
                  onClick={() => void handleDownload("markdown")}
                  disabled={!result}
                  aria-label="Download Prompt Pack Markdown"
                >
                  <Download className="h-3.5 w-3.5" />
                  Markdown
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-lg border-border-subtle text-xs"
                  onClick={() => void handleDownload("json")}
                  disabled={!result}
                  aria-label="Download Prompt Pack JSON"
                >
                  <FileJson className="h-3.5 w-3.5" />
                  JSON
                </Button>
              </div>
            </div>

            {error ? (
              <div className="border-b border-state-error/25 bg-state-error/10 px-4 py-2 text-xs text-state-error">
                {error}
              </div>
            ) : null}

            <Tabs defaultValue="global" className="min-h-0 flex-1 gap-0 overflow-hidden">
              <TabsList className="mx-4 mt-3 h-auto w-[calc(100%-2rem)] justify-start overflow-x-auto rounded-lg bg-bg-subtle p-1">
                <TabsTrigger value="global" className="min-w-fit gap-1 px-3 text-xs">
                  <FileText className="h-3.5 w-3.5" />
                  Global Prompt
                </TabsTrigger>
                <TabsTrigger value="layers" className="min-w-fit gap-1 px-3 text-xs">
                  <Layers className="h-3.5 w-3.5" />
                  Layers
                </TabsTrigger>
                <TabsTrigger value="nodes" className="min-w-fit gap-1 px-3 text-xs">
                  <Box className="h-3.5 w-3.5" />
                  Nodes
                </TabsTrigger>
                <TabsTrigger value="improvements" className="min-w-fit gap-1 px-3 text-xs">
                  <Sparkles className="h-3.5 w-3.5" />
                  Canvas Improvements
                </TabsTrigger>
                <TabsTrigger value="json" className="min-w-fit gap-1 px-3 text-xs">
                  <FileJson className="h-3.5 w-3.5" />
                  JSON
                </TabsTrigger>
              </TabsList>

              <TabsContent value="global" className="min-h-0 overflow-hidden">
                <ScrollArea className="max-h-[58vh] min-h-[18rem] bg-bg-base">
                  {loading ? (
                    <EmptyPanel>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin text-accent-primary" />
                      Generating AI Prompt Pack...
                    </EmptyPanel>
                  ) : proposal ? (
                    <div className="space-y-3 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-text-primary">
                          {proposal.globalPrompt.title}
                        </h3>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 rounded-lg border-border-subtle text-xs"
                          onClick={() =>
                            void copyText("global", proposal.globalPrompt.markdown)
                          }
                        >
                          <Clipboard className="h-3.5 w-3.5" />
                          {copied === "global" ? "Copied" : "Copy global"}
                        </Button>
                      </div>
                      <pre className="min-w-0 whitespace-pre-wrap rounded-lg border border-border-subtle bg-bg-surface p-4 font-mono text-[11px] leading-relaxed text-text-secondary">
                        {proposal.globalPrompt.markdown}
                      </pre>
                    </div>
                  ) : (
                    <EmptyPanel>Generate an AI Prompt Pack to preview the global prompt.</EmptyPanel>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="layers" className="min-h-0 overflow-hidden">
                <ScrollArea className="max-h-[58vh] min-h-[18rem] bg-bg-base">
                  {proposal?.layerPrompts.length ? (
                    <div className="space-y-3 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <select
                          value={activeLayerIndex}
                          onChange={(event) =>
                            setActiveLayerIndex(Number(event.target.value))
                          }
                          className="max-w-full rounded-lg border border-border-subtle bg-bg-surface px-3 py-2 text-xs text-text-primary outline-none"
                          aria-label="Select layer prompt"
                        >
                          {proposal.layerPrompts.map((layer, index) => (
                            <option key={layer.graphId} value={index}>
                              {layer.title}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 rounded-lg border-border-subtle text-xs"
                          onClick={() => void copyText("layer", activeLayer?.markdown)}
                          disabled={!activeLayer}
                        >
                          <Clipboard className="h-3.5 w-3.5" />
                          {copied === "layer" ? "Copied" : "Copy layer"}
                        </Button>
                      </div>
                      <pre className="min-w-0 whitespace-pre-wrap rounded-lg border border-border-subtle bg-bg-surface p-4 font-mono text-[11px] leading-relaxed text-text-secondary">
                        {activeLayer?.markdown}
                      </pre>
                    </div>
                  ) : (
                    <EmptyPanel>No layer prompts yet.</EmptyPanel>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="nodes" className="min-h-0 overflow-hidden">
                <ScrollArea className="max-h-[58vh] min-h-[18rem] bg-bg-base">
                  {proposal?.nodePrompts.length ? (
                    <div className="space-y-3 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <select
                          value={activeNodeIndex}
                          onChange={(event) =>
                            setActiveNodeIndex(Number(event.target.value))
                          }
                          className="max-w-full rounded-lg border border-border-subtle bg-bg-surface px-3 py-2 text-xs text-text-primary outline-none"
                          aria-label="Select node prompt"
                        >
                          {proposal.nodePrompts.map((nodePrompt, index) => (
                            <option
                              key={`${nodePrompt.graphId}:${nodePrompt.nodeId}`}
                              value={index}
                            >
                              {nodePrompt.nodeLabel}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 rounded-lg border-border-subtle text-xs"
                          onClick={() => void copyText("node", activeNode?.markdown)}
                          disabled={!activeNode}
                        >
                          <Clipboard className="h-3.5 w-3.5" />
                          {copied === "node" ? "Copied" : "Copy node"}
                        </Button>
                      </div>
                      <pre className="min-w-0 whitespace-pre-wrap rounded-lg border border-border-subtle bg-bg-surface p-4 font-mono text-[11px] leading-relaxed text-text-secondary">
                        {activeNode?.markdown}
                      </pre>
                    </div>
                  ) : (
                    <EmptyPanel>No node prompts yet.</EmptyPanel>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="improvements" className="min-h-0 overflow-hidden">
                <ScrollArea className="max-h-[58vh] min-h-[18rem] bg-bg-base">
                  {hasImprovements && improvement ? (
                    <div className="space-y-3 p-4">
                      <div className="rounded-lg border border-accent-primary/25 bg-accent-primary-dim p-3 text-xs leading-relaxed text-text-secondary">
                        <p className="font-semibold text-accent-primary">
                          {improvement.summary || "Canvas improvement proposal"}
                        </p>
                        <p className="mt-1">
                          {improvementPreview
                            ? "Server preview validates target graphs, temp IDs, and blocking issues before apply."
                            : "Apply only after reviewing the operations below."}
                        </p>
                      </div>
                      {improvementPreview?.affectedGraphIds.length ? (
                        <div className="flex flex-wrap gap-1.5 rounded-lg border border-border-subtle bg-bg-surface p-3">
                          {improvementPreview.affectedGraphIds.map((graphId) => (
                            <span
                              key={graphId}
                              className="rounded-full border border-accent-primary/25 bg-accent-primary-dim px-2 py-1 font-mono text-[10px] text-accent-primary"
                            >
                              {graphId}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {improvementPreview?.issues.length ? (
                        <div className="space-y-2">
                          {improvementPreview.issues.slice(0, 4).map((item) => (
                            <div
                              key={`${item.operationIndex}-${item.message}`}
                              className={cn(
                                "flex gap-2 rounded-lg border p-3 text-xs",
                                item.blocking
                                  ? "border-state-error/30 bg-state-error/10 text-state-error"
                                  : "border-state-warning/25 bg-state-warning/10 text-state-warning"
                              )}
                            >
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>{item.message}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="space-y-2">
                        {improvement.operations.map((operation, index) => (
                          <div
                            key={`${operation.op}-${index}`}
                            className="rounded-lg border border-border-subtle bg-bg-surface p-3"
                          >
                            <p className="text-xs font-semibold text-text-primary">
                              {index + 1}. {operation.op}
                            </p>
                            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-text-muted">
                              {JSON.stringify(operation, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                      <Button
                        className="gap-2 rounded-lg bg-accent-primary text-bg-base hover:bg-accent-primary/90"
                        onClick={() => void handleApplyImprovements()}
                        disabled={applyLoading || !improvementCanApply}
                        aria-label="Apply canvas improvements"
                      >
                        {applyLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Apply canvas improvements
                      </Button>
                      {applyResult ? (
                        <div className="rounded-lg border border-state-success/30 bg-state-success/10 p-3 text-xs text-state-success">
                          Applied {applyResult.applied.operations} operation(s), skipped {applyResult.applied.skippedOperations}.
                        </div>
                      ) : null}
                      {applyResult?.issues.length ? (
                        <div className="space-y-2">
                          {applyResult.issues.map((item) => (
                            <div
                              key={`${item.operationIndex}-${item.message}`}
                              className="flex gap-2 rounded-lg border border-state-warning/25 bg-state-warning/10 p-3 text-xs text-state-warning"
                            >
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>{item.message}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <EmptyPanel>No canvas improvements proposed.</EmptyPanel>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="json" className="min-h-0 overflow-hidden">
                <ScrollArea className="max-h-[58vh] min-h-[18rem] bg-bg-base">
                  {proposal ? (
                    <pre className="min-w-0 overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-text-secondary">
                      {proposalJson}
                    </pre>
                  ) : (
                    <EmptyPanel>JSON preview appears after generation.</EmptyPanel>
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
