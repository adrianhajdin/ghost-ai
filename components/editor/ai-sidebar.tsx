"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import {
  AlertTriangle,
  Bot,
  Check,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AiStatusFeedMessageSchema, ChatFeedMessageSchema } from "@/types/tasks"
import { cn } from "@/lib/utils"
import { isTerminalAiRunStatus, useAiRunStatus } from "@/hooks/use-ai-run-status"
import { useRealtimeRoom } from "@/hooks/use-realtime-room"
import {
  ARCHITECTURE_DRAFT_COMPLEXITIES,
  architectureDraftHasErrors,
  getArchitectureDraftGraphs,
  type ArchitectureDraftComplexity,
  type ArchitectureDraftProposal,
  type ArchitectureDraftValidationResult,
} from "@/lib/architecture-draft/architecture-draft"
import {
  AI_ASSISTANT_NAME,
  AI_WORKSPACE_TAGLINE,
  AI_WORKSPACE_TITLE,
} from "@/lib/branding"

interface SpecItem {
  id: string
  filePath: string
  createdAt: string
}

interface ArchitectureDraftRunOutput {
  proposal?: ArchitectureDraftProposal
  summary?: {
    title?: string
    nodeCount?: number
    edgeCount?: number
    graphCount?: number
    childLayerCount?: number
    clarificationQuestionCount?: number
    errors?: number
    warnings?: number
    info?: number
  }
  validation?: ArchitectureDraftValidationResult[]
}

const ARCHITECTURE_DRAFT_STORAGE_PREFIX = "arc-forge:architecture-draft"
const architectureDraftRunMemory = new Map<string, string>()

function readStoredDraftRunId(storageKey: string): string | null {
  const memoryRunId = architectureDraftRunMemory.get(storageKey) ?? null

  try {
    return window.localStorage.getItem(storageKey) ?? memoryRunId
  } catch {
    return memoryRunId
  }
}

function writeStoredDraftRunId(storageKey: string, runId: string): void {
  architectureDraftRunMemory.set(storageKey, runId)

  try {
    window.localStorage.setItem(storageKey, runId)
  } catch {
    // The run still exists server-side; storage failures should not block drafting.
  }
}

function removeStoredDraftRunId(storageKey: string): void {
  architectureDraftRunMemory.delete(storageKey)

  try {
    window.localStorage.removeItem(storageKey)
  } catch {
    // Best-effort cleanup for browsers that restrict local storage.
  }
}

function getFilename(filePath: string): string {
  const clean = filePath.split("?")[0]
  return clean.split("/").at(-1) ?? "spec.md"
}

function formatSpecDate(date: string): string {
  return new Date(date).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface RunTrackerProps {
  runId: string
  onTerminal: (status: string, output: unknown) => void
}

function RunTracker({ runId, onTerminal }: RunTrackerProps) {
  const { run } = useAiRunStatus(runId)
  const firedRef = useRef(false)

  useEffect(() => {
    if (!run || firedRef.current) return
    if (!isTerminalAiRunStatus(run.status)) return
    firedRef.current = true
    onTerminal(run.status, run.resultJson)
  }, [run, onTerminal])

  return null
}

interface AiSidebarProps {
  isOpen: boolean
  onClose: () => void
  roomId: string
  realtimeRoomId: string
  projectId: string
  graphId: string
}

const STARTER_CHIPS = [
  "Design an e-commerce backend",
  "Create a chat app architecture",
  "Build a CI/CD pipeline",
]

function formatTime(createdAt: number): string {
  return new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function AiSidebar({
  isOpen,
  onClose,
  roomId,
  realtimeRoomId,
  projectId,
  graphId,
}: AiSidebarProps) {
  const {
    nodes,
    edges,
    currentUserName,
    chatMessages,
    aiStatuses,
    setCanvasSnapshot,
    sendChatMessage,
    broadcastRoomEvent,
    patchPresence,
  } = useRealtimeRoom()
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [statusText, setStatusText] = useState<string>("")
  const [chatInput, setChatInput] = useState("")
  const [chatError, setChatError] = useState<string | null>(null)
  const [draftPrompt, setDraftPrompt] = useState("")
  const [draftComplexity, setDraftComplexity] =
    useState<ArchitectureDraftComplexity>("standard")
  const [draftRunId, setDraftRunId] = useState<string | null>(null)
  const [isDraftGenerating, setIsDraftGenerating] = useState(false)
  const [draftProposal, setDraftProposal] =
    useState<ArchitectureDraftProposal | null>(null)
  const [draftValidation, setDraftValidation] = useState<
    ArchitectureDraftValidationResult[]
  >([])
  const [draftSummary, setDraftSummary] =
    useState<ArchitectureDraftRunOutput["summary"] | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [draftApplyMessage, setDraftApplyMessage] = useState<string | null>(null)
  const [isApplyingDraft, setIsApplyingDraft] = useState(false)
  const draftStorageKey = `${ARCHITECTURE_DRAFT_STORAGE_PREFIX}:${projectId}:${graphId}`
  const lastDraftStorageKeyRef = useRef(draftStorageKey)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const draftTextareaRef = useRef<HTMLTextAreaElement>(null)
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Spec state
  const [specs, setSpecs] = useState<SpecItem[]>([])
  const [specsLoading, setSpecsLoading] = useState(false)
  const [selectedSpec, setSelectedSpec] = useState<SpecItem | null>(null)
  const [specContent, setSpecContent] = useState<string | null>(null)
  const [specContentLoading, setSpecContentLoading] = useState(false)
  const [specModalOpen, setSpecModalOpen] = useState(false)
  const [isSpecGenerating, setIsSpecGenerating] = useState(false)
  const [specRunId, setSpecRunId] = useState<string | null>(null)

  const fetchSpecs = useCallback(async () => {
    await Promise.resolve()
    setSpecsLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/specs`)
      const data: unknown = res.ok ? await res.json() : []
      setSpecs(Array.isArray(data) ? (data as SpecItem[]) : [])
    } catch {
      setSpecs([])
    } finally {
      setSpecsLoading(false)
    }
  }, [projectId])

  // Fetch specs when sidebar opens
  useEffect(() => {
    if (!isOpen) return
    const timeoutId = window.setTimeout(() => {
      void fetchSpecs()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [isOpen, fetchSpecs])

  const handleSpecRunTerminal = useCallback(
    (status: string) => {
      setIsSpecGenerating(false)
      setSpecRunId(null)
      if (status === "succeeded") void fetchSpecs()
    },
    [fetchSpecs]
  )

  const handleRunTerminal = useCallback(
    (status: string, output: unknown) => {
      const isSuccess = status === "succeeded"
      const typedOutput = output as { summary?: string } | undefined
      const content = isSuccess
        ? (typedOutput?.summary ?? "Design applied to canvas.")
        : `${AI_ASSISTANT_NAME} encountered an error. Please try again.`

      sendChatMessage(content, { role: "assistant", sender: AI_ASSISTANT_NAME })
      broadcastRoomEvent({
        type: "ai.status",
        payload: {
          text: content,
          status: isSuccess ? "complete" : "error",
        },
      })

      setIsLoading(false)
      setStatusText("")
      setRunId(null)
      patchPresence({ thinking: false })
    },
    [broadcastRoomEvent, patchPresence, sendChatMessage]
  )

  const handleDraftRunTerminal = useCallback((status: string, output: unknown) => {
    setIsDraftGenerating(false)
    setDraftRunId(null)
    patchPresence({ thinking: false })

    if (status !== "succeeded") {
      removeStoredDraftRunId(draftStorageKey)
      setDraftError("Architecture draft generation failed. Please try again.")
      broadcastRoomEvent({
        type: "ai.status",
        payload: {
          text: "Architecture draft generation failed.",
          status: "error",
        },
      })
      return
    }

    const typedOutput = output as ArchitectureDraftRunOutput | null
    if (!typedOutput?.proposal) {
      removeStoredDraftRunId(draftStorageKey)
      setDraftError("Architecture draft result was empty.")
      return
    }

    setDraftProposal(typedOutput.proposal)
    setDraftValidation(typedOutput.validation ?? [])
    setDraftSummary(typedOutput.summary ?? null)
    setDraftError(null)
    setDraftApplyMessage(null)
    broadcastRoomEvent({
      type: "ai.status",
      payload: {
        text: "Architecture draft is ready for review.",
        status: "complete",
      },
    })
  }, [broadcastRoomEvent, draftStorageKey, patchPresence])

  // Latest validated feed message for the status strip fallback
  const latestFeedMessage = (() => {
    if (!aiStatuses.length) return null
    const sorted = [...aiStatuses].sort((a, b) => b.createdAt - a.createdAt)
    const parsed = AiStatusFeedMessageSchema.safeParse(sorted[0])
    return parsed.success ? parsed.data : null
  })()

  // Validated chat messages from the ai-chat feed, in chronological order
  const validatedChatMessages = chatMessages
    .map((msg) => {
      const parsed = ChatFeedMessageSchema.safeParse(msg)
      if (!parsed.success) return null
      return { id: msg.id, createdAt: msg.createdAt, ...parsed.data }
    })
    .filter((msg): msg is NonNullable<typeof msg> => msg !== null)
    .sort((a, b) => a.createdAt - b.createdAt)

  const handleGenerateSpec = useCallback(async () => {
    if (isSpecGenerating) return
    setIsSpecGenerating(true)

    const chatHistory = validatedChatMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }))

    try {
      const res = await fetch("/api/ai/spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, chatHistory, nodes, edges }),
      })
      if (!res.ok) throw new Error("Spec generation failed")
      const { runId: newSpecRunId } = (await res.json()) as { runId: string }

      setSpecRunId(newSpecRunId)
    } catch {
      setIsSpecGenerating(false)
    }
  }, [isSpecGenerating, roomId, nodes, edges, validatedChatMessages])

  // Scroll both tabs to bottom when messages update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [validatedChatMessages.length])

  useEffect(() => {
    if (draftProposal || draftRunId || isDraftGenerating) return

    const restoredRunId = readStoredDraftRunId(draftStorageKey)
    if (!restoredRunId) return

    const restoreTimer = window.setTimeout(() => {
      setDraftError(null)
      setDraftApplyMessage(null)
      setDraftValidation([])
      setDraftSummary(null)
      setIsDraftGenerating(true)
      setDraftRunId(restoredRunId)
      patchPresence({ thinking: true })
    }, 0)

    return () => window.clearTimeout(restoreTimer)
  }, [draftProposal, draftRunId, draftStorageKey, isDraftGenerating, patchPresence])

  useEffect(() => {
    if (lastDraftStorageKeyRef.current === draftStorageKey) return

    lastDraftStorageKeyRef.current = draftStorageKey
    const restoredRunId = readStoredDraftRunId(draftStorageKey)

    const restoreTimer = window.setTimeout(() => {
      setDraftProposal(null)
      setDraftValidation([])
      setDraftSummary(null)
      setDraftError(null)
      setDraftApplyMessage(null)
      setIsDraftGenerating(Boolean(restoredRunId))
      setDraftRunId(restoredRunId)
      patchPresence({ thinking: Boolean(restoredRunId) })
    }, 0)

    return () => window.clearTimeout(restoreTimer)
  }, [draftStorageKey, patchPresence])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = "72px"
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [])

  const handleDraftPromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraftPrompt(e.target.value)
    const ta = e.target
    ta.style.height = "96px"
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`
  }, [])

  const handleGenerateArchitectureDraft = useCallback(async () => {
    const prompt = draftPrompt.trim()
    if (!prompt || isDraftGenerating) return

    setIsDraftGenerating(true)
    setDraftError(null)
    setDraftApplyMessage(null)
    setDraftProposal(null)
    setDraftValidation([])
    setDraftSummary(null)
    removeStoredDraftRunId(draftStorageKey)
    patchPresence({ thinking: true })
    broadcastRoomEvent({
      type: "ai.status",
      payload: {
        text: "Generating architecture draft proposal...",
        status: "start",
      },
    })

    try {
      const response = await fetch("/api/ai/architecture-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          projectId,
          graphId,
          complexity: draftComplexity,
        }),
      })

      if (!response.ok) throw new Error("Architecture draft request failed")
      const { runId: newRunId } = (await response.json()) as { runId: string }
      writeStoredDraftRunId(draftStorageKey, newRunId)
      setDraftRunId(newRunId)
    } catch {
      setIsDraftGenerating(false)
      patchPresence({ thinking: false })
      setDraftError("Failed to start architecture draft generation.")
      broadcastRoomEvent({
        type: "ai.status",
        payload: {
          text: "Failed to start architecture draft generation.",
          status: "error",
        },
      })
    }
  }, [
    broadcastRoomEvent,
    draftStorageKey,
    draftComplexity,
    draftPrompt,
    graphId,
    isDraftGenerating,
    patchPresence,
    projectId,
  ])

  const handleApplyArchitectureDraft = useCallback(async () => {
    if (!draftProposal || isApplyingDraft || architectureDraftHasErrors(draftValidation)) {
      return
    }

    setIsApplyingDraft(true)
    setDraftError(null)
    setDraftApplyMessage(null)

    try {
      const response = await fetch(`/api/projects/${projectId}/architecture-draft/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          graphId,
          mode: "append",
          proposal: draftProposal,
        }),
      })
      const data = (await response.json().catch(() => ({}))) as {
        error?: string
        validation?: ArchitectureDraftValidationResult[]
        canvas?: { nodes: typeof nodes; edges: typeof edges }
        applied?: { nodes?: number; edges?: number; childGraphs?: number }
      }

      if (!response.ok) {
        setDraftValidation(data.validation ?? draftValidation)
        throw new Error(data.error ?? "Architecture draft apply failed")
      }

      if (data.canvas) {
        setCanvasSnapshot(data.canvas)
      }

      const appliedNodes = data.applied?.nodes ?? draftProposal.nodes.length
      const appliedEdges = data.applied?.edges ?? draftProposal.edges.length
      const childGraphs = data.applied?.childGraphs ?? 0
      removeStoredDraftRunId(draftStorageKey)
      setDraftApplyMessage(
        `Applied ${appliedNodes} node${appliedNodes === 1 ? "" : "s"} and ${appliedEdges} edge${appliedEdges === 1 ? "" : "s"} to this canvas${childGraphs ? `, with ${childGraphs} child layer${childGraphs === 1 ? "" : "s"}` : ""}.`
      )
      broadcastRoomEvent({
        type: "ai.status",
        payload: {
          text: "Architecture draft applied to canvas.",
          status: "complete",
        },
      })
    } catch (error) {
      setDraftError(
        error instanceof Error ? error.message : "Architecture draft apply failed."
      )
    } finally {
      setIsApplyingDraft(false)
    }
  }, [
    broadcastRoomEvent,
    draftProposal,
    draftStorageKey,
    draftValidation,
    graphId,
    isApplyingDraft,
    projectId,
    setCanvasSnapshot,
  ])

  const handleClearArchitectureDraft = useCallback(() => {
    setDraftProposal(null)
    setDraftValidation([])
    setDraftSummary(null)
    setDraftError(null)
    setDraftApplyMessage(null)
    removeStoredDraftRunId(draftStorageKey)
  }, [draftStorageKey])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    setInput("")
    setIsLoading(true)
    patchPresence({ thinking: true })

    if (textareaRef.current) {
      textareaRef.current.style.height = "72px"
    }

    sendChatMessage(text)

    // Write initial status to ai-status-feed
    broadcastRoomEvent({
      type: "ai.status",
      payload: {
        text: `${AI_ASSISTANT_NAME} is analyzing your request…`,
        status: "start",
      },
    })

    setStatusText(`${AI_ASSISTANT_NAME} is analyzing your request…`)

    try {
      const designRes = await fetch("/api/ai/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, roomId: realtimeRoomId, projectId, graphId }),
      })

      if (!designRes.ok) throw new Error("Design request failed")

      const { runId: newRunId } = (await designRes.json()) as { runId: string }

      setRunId(newRunId)
    } catch {
      sendChatMessage(`Failed to reach ${AI_ASSISTANT_NAME}. Please try again.`, {
        role: "assistant",
        sender: AI_ASSISTANT_NAME,
      })
      broadcastRoomEvent({
        type: "ai.status",
        payload: {
          text: `${AI_ASSISTANT_NAME} encountered an error.`,
          status: "error",
        },
      })

      setIsLoading(false)
      setStatusText("")
      patchPresence({ thinking: false })
    }
  }, [
    broadcastRoomEvent,
    graphId,
    input,
    isLoading,
    patchPresence,
    projectId,
    realtimeRoomId,
    sendChatMessage,
  ])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleChip = useCallback((chip: string) => {
    setInput(chip)
    if (textareaRef.current) {
      textareaRef.current.style.height = "72px"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
      textareaRef.current.focus()
    }
  }, [])

  const handleChatInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value)
    const ta = e.target
    ta.style.height = "72px"
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [])

  const handleChatSend = useCallback(async () => {
    const text = chatInput.trim()
    if (!text) return

    setChatError(null)

    try {
      const sent = sendChatMessage(text)
      if (!sent) throw new Error("Realtime chat is disconnected")
      setChatInput("")
      if (chatTextareaRef.current) {
        chatTextareaRef.current.style.height = "72px"
      }
    } catch {
      setChatError("Failed to send message. Please try again.")
    }
  }, [chatInput, sendChatMessage])

  const handleChatKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleChatSend()
      }
    },
    [handleChatSend]
  )

  const handleSpecClick = useCallback(
    async (spec: SpecItem) => {
      setSelectedSpec(spec)
      setSpecContent(null)
      setSpecContentLoading(true)
      setSpecModalOpen(true)

      try {
        const res = await fetch(`/api/projects/${projectId}/specs/${spec.id}`)
        if (!res.ok) throw new Error("Failed to fetch spec")
        const text = await res.text()
        setSpecContent(text)
      } catch {
        setSpecContent(null)
      } finally {
        setSpecContentLoading(false)
      }
    },
    [projectId]
  )

  const handleSpecDownload = useCallback(
    (specId: string) => {
      const a = document.createElement("a")
      a.href = `/api/projects/${projectId}/specs/${specId}/download`
      a.download = `spec-${specId}.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    },
    [projectId]
  )

  const handleModalClose = useCallback(() => {
    setSpecModalOpen(false)
    setSelectedSpec(null)
    setSpecContent(null)
  }, [])

  const activeStatusText = isLoading ? latestFeedMessage?.text ?? statusText : ""

  return (
    <>
      {runId && (
        <RunTracker
          runId={runId}
          onTerminal={handleRunTerminal}
        />
      )}
      {specRunId && (
        <RunTracker
          runId={specRunId}
          onTerminal={handleSpecRunTerminal}
        />
      )}
      {draftRunId && (
        <RunTracker
          runId={draftRunId}
          onTerminal={handleDraftRunTerminal}
        />
      )}

      {/* Spec preview modal */}
      <Dialog open={specModalOpen} onOpenChange={(open) => { if (!open) handleModalClose() }}>
        <DialogContent
          showCloseButton
          className="max-w-2xl border-border-default bg-bg-surface"
        >
          <DialogHeader>
            <DialogTitle className="pr-6 text-sm font-medium text-text-primary">
              {selectedSpec ? getFilename(selectedSpec.filePath) : "Spec Preview"}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] rounded-xl border border-border-subtle bg-bg-elevated">
            <div className="p-4">
              {specContentLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
                </div>
              ) : specContent ? (
                <div
                  className={cn(
                    "text-sm text-text-secondary leading-relaxed",
                    "[&_h1]:text-base [&_h1]:font-bold [&_h1]:text-text-primary [&_h1]:mb-3 [&_h1]:mt-0",
                    "[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-text-primary [&_h2]:mb-2 [&_h2]:mt-4",
                    "[&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-text-secondary [&_h3]:mb-1.5 [&_h3]:mt-3",
                    "[&_p]:mb-2 [&_p]:leading-relaxed",
                    "[&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2",
                    "[&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-2",
                    "[&_li]:mb-1",
                    "[&_code]:font-mono [&_code]:text-xs [&_code]:bg-bg-subtle [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-accent-ai-text",
                    "[&_pre]:bg-bg-subtle [&_pre]:p-3 [&_pre]:rounded-xl [&_pre]:mb-2 [&_pre]:overflow-x-auto",
                    "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
                    "[&_strong]:font-semibold [&_strong]:text-text-primary",
                    "[&_blockquote]:border-l-2 [&_blockquote]:border-border-subtle [&_blockquote]:pl-3 [&_blockquote]:text-text-muted [&_blockquote]:italic"
                  )}
                >
                  <ReactMarkdown>{specContent}</ReactMarkdown>
                </div>
              ) : (
                <p className="py-8 text-center text-xs text-text-muted">
                  Failed to load spec content.
                </p>
              )}
            </div>
          </ScrollArea>

          <div className="flex justify-end border-t border-border-default pt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => selectedSpec && handleSpecDownload(selectedSpec.id)}
              className="h-7 gap-1.5 rounded-lg border-border-subtle px-3 text-xs text-text-secondary hover:border-border-default hover:text-text-primary"
            >
              <Download className="h-3 w-3" />
              Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    <aside
      className={cn(
        "fixed inset-y-3 right-3 top-15 z-40 hidden w-84 flex-col rounded-3xl border border-border-subtle bg-bg-surface/95 shadow-xl ring-1 ring-accent-ai/10 backdrop-blur-xl transition-transform duration-300 lg:flex",
        isOpen ? "translate-x-0" : "translate-x-[calc(100%+1rem)]"
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border-default px-5 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-ai/15">
          <Bot className="h-4 w-4 text-accent-ai-text" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">{AI_WORKSPACE_TITLE}</p>
          <p className="text-xs text-text-muted">{AI_WORKSPACE_TAGLINE}</p>
        </div>
        {isLoading && (
          <div className="flex items-center gap-1 rounded-full bg-accent-ai/15 px-2 py-0.5 text-[10px] text-accent-ai-text">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            <span>Working</span>
          </div>
        )}
        <button
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-subtle hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="draft" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TabsList className="mx-4 mt-3 grid h-auto w-auto shrink-0 grid-cols-4 rounded-xl bg-bg-subtle p-1">
          <TabsTrigger
            value="draft"
            className="rounded-lg px-3 py-1.5 text-xs font-medium data-active:bg-accent-ai data-active:text-white data-active:shadow-none"
          >
            Architect
          </TabsTrigger>
          <TabsTrigger
            value="design"
            className="rounded-lg px-3 py-1.5 text-xs font-medium data-active:bg-accent-ai data-active:text-white data-active:shadow-none"
          >
            Design
          </TabsTrigger>
          <TabsTrigger
            value="chat"
            className="rounded-lg px-3 py-1.5 text-xs font-medium data-active:bg-accent-ai data-active:text-white data-active:shadow-none"
          >
            Chat
          </TabsTrigger>
          <TabsTrigger
            value="specs"
            className="rounded-lg px-3 py-1.5 text-xs font-medium data-active:bg-accent-ai data-active:text-white data-active:shadow-none"
          >
            Specs
          </TabsTrigger>
        </TabsList>

        {/* Architecture Draft Tab */}
        <TabsContent value="draft" className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full flex-col">
            <ScrollArea className="flex-1">
              <div className="grid gap-3 px-4 py-3">
                <div className="rounded-2xl border border-accent-ai/20 bg-accent-ai/10 p-3">
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-ai-text" />
                    <div>
                      <p className="text-xs font-semibold text-text-primary">
                        AI proposes the architecture. Arc Forge only previews, applies, saves, and protects the canvas.
                      </p>
                      <p className="mt-1 text-[11px] leading-4 text-text-muted">
                        Canvas layers work like a pyramid: root context first, deeper layers for internal detail.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 rounded-2xl border border-border-subtle bg-bg-elevated p-3">
                  <Textarea
                    ref={draftTextareaRef}
                    value={draftPrompt}
                    onChange={handleDraftPromptChange}
                    placeholder="Describe the system you want to model..."
                    disabled={isDraftGenerating}
                    style={{ height: "96px", maxHeight: "180px" }}
                    className="resize-none overflow-y-auto border-0 bg-transparent p-0 text-sm text-text-primary shadow-none placeholder:text-text-faint focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
                  />
                  <div className="flex items-center gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Draft complexity</span>
                      <select
                        value={draftComplexity}
                        onChange={(event) =>
                          setDraftComplexity(event.target.value as ArchitectureDraftComplexity)
                        }
                        disabled={isDraftGenerating}
                        className="h-8 w-full rounded-lg border border-border-default bg-bg-subtle px-2 text-xs text-text-primary outline-none transition-colors focus:border-accent-ai/60 disabled:opacity-50"
                      >
                        {ARCHITECTURE_DRAFT_COMPLEXITIES.map((complexity) => (
                          <option key={complexity} value={complexity}>
                            {complexity}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      size="sm"
                      onClick={handleGenerateArchitectureDraft}
                      disabled={!draftPrompt.trim() || isDraftGenerating}
                      className="h-8 gap-1.5 rounded-lg bg-accent-ai px-3 text-xs text-white hover:bg-accent-ai/80 disabled:opacity-40"
                    >
                      {isDraftGenerating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      {isDraftGenerating ? "Generating" : "Generate"}
                    </Button>
                  </div>
                </div>

                {draftError ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {draftError}
                  </div>
                ) : null}

                {draftApplyMessage ? (
                  <div className="rounded-xl border border-state-success/25 bg-state-success/10 px-3 py-2 text-xs text-state-success">
                    {draftApplyMessage}
                  </div>
                ) : null}

                {isDraftGenerating ? (
                  <div className="flex items-center gap-2 rounded-xl border border-accent-ai/20 bg-accent-ai/10 px-3 py-2 text-xs text-accent-ai-text">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Drafting architecture proposal...</span>
                  </div>
                ) : null}

                {draftProposal ? (
                  <ArchitectureDraftPreview
                    proposal={draftProposal}
                    summary={draftSummary}
                    validation={draftValidation}
                    isApplying={isApplyingDraft}
                    onApply={handleApplyArchitectureDraft}
                    onClear={handleClearArchitectureDraft}
                  />
                ) : null}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        {/* AI Canvas Design Tab */}
        <TabsContent value="design" className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full flex-col">
            <ScrollArea className="flex-1" ref={scrollRef as React.Ref<HTMLDivElement>}>
              <div className="px-4 pt-3 pb-2">
                {validatedChatMessages.length === 0 ? (
                  <div className="flex flex-col items-center gap-5 py-8 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-ai/15">
                      <Bot className="h-6 w-6 text-accent-ai-text" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {AI_ASSISTANT_NAME}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-text-muted">
                        Describe your system and I&apos;ll design the architecture on the canvas.
                      </p>
                    </div>
                    <div className="flex w-full flex-col gap-2">
                      {STARTER_CHIPS.map((chip) => (
                        <button
                          key={chip}
                          onClick={() => handleChip(chip)}
                          className="w-full rounded-full bg-bg-subtle px-4 py-2 text-left text-xs text-accent-ai-text transition-colors hover:bg-border-default"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 pb-2">
                    {validatedChatMessages.map((msg) =>
                      msg.role === "assistant" ? (
                        <div key={msg.id} className="flex justify-start gap-2">
                          <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-ai/15">
                            <Bot className="h-3 w-3 text-accent-ai-text" />
                          </div>
                          <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-accent-ai-text">
                            {msg.content}
                          </div>
                        </div>
                      ) : (
                        <div key={msg.id} className="flex justify-end">
                          <div
                            className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm font-medium text-white"
                            style={{ backgroundColor: "#62C073" }}
                          >
                            {msg.content}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Status strip — only visible while a run is active */}
            {isLoading && activeStatusText && (
              <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-accent-ai/20 bg-accent-ai/10 px-3 py-2 text-xs text-accent-ai-text">
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                <span className="truncate">{activeStatusText}</span>
              </div>
            )}

            {/* Input area */}
            <div className="shrink-0 border-t border-border-default p-3">
              <div className="flex flex-col gap-2 rounded-2xl border border-border-subtle bg-bg-elevated p-3">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe your system…"
                  disabled={isLoading}
                  style={{ height: "72px", maxHeight: "160px" }}
                  className="resize-none overflow-y-auto border-0 bg-transparent p-0 text-sm text-text-primary shadow-none placeholder:text-text-faint focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-faint">Shift+Enter for newline</span>
                  <Button
                    size="sm"
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className="h-7 gap-1.5 rounded-lg px-3 text-xs text-white hover:opacity-90 disabled:opacity-40"
                    style={
                      !isLoading && input.trim()
                        ? { backgroundColor: "#62C073" }
                        : undefined
                    }
                  >
                    {isLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    {isLoading ? "Thinking…" : "Send"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Chat Tab */}
        <TabsContent value="chat" className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full flex-col">
            <ScrollArea className="flex-1" ref={chatScrollRef as React.Ref<HTMLDivElement>}>
              <div className="px-4 pt-3 pb-2">
                {validatedChatMessages.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 py-8 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-bg-subtle">
                      <MessageSquare className="h-5 w-5 text-text-muted" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">Room Chat</p>
                      <p className="mt-1 text-xs leading-5 text-text-muted">
                        No messages yet. Start the conversation!
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 pb-2">
                    {validatedChatMessages.map((msg) => {
                      const isMe =
                        msg.role === "user" && msg.sender === currentUserName
                      const isAI = msg.role === "assistant"
                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex flex-col gap-0.5",
                            isMe ? "items-end" : "items-start"
                          )}
                        >
                          <div
                            className={cn(
                              "flex items-center gap-1.5 text-[10px] text-text-faint",
                              isMe && "flex-row-reverse"
                            )}
                          >
                            <span className="font-medium text-text-muted">
                              {isAI ? AI_ASSISTANT_NAME : msg.sender}
                            </span>
                            <span>{formatTime(msg.createdAt)}</span>
                          </div>
                          <div
                            className={cn(
                              "max-w-[85%] rounded-2xl px-3 py-2 text-xs text-text-primary",
                              isMe
                                ? "rounded-br-sm font-medium text-white"
                                : isAI
                                  ? "rounded-bl-sm border border-border-subtle bg-bg-elevated text-accent-ai-text"
                                  : "rounded-bl-sm border border-border-subtle bg-bg-elevated"
                            )}
                            style={isMe ? { backgroundColor: "#62C073" } : undefined}
                          >
                            {msg.content}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Error state */}
            {chatError && (
              <div className="mx-3 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {chatError}
              </div>
            )}

            {/* Input area */}
            <div className="shrink-0 border-t border-border-default p-3">
              <div className="flex flex-col gap-2 rounded-2xl border border-border-subtle bg-bg-elevated p-3">
                <Textarea
                  ref={chatTextareaRef}
                  value={chatInput}
                  onChange={handleChatInputChange}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Send a message…"
                  style={{ height: "72px", maxHeight: "160px" }}
                  className="resize-none overflow-y-auto border-0 bg-transparent p-0 text-sm text-text-primary shadow-none placeholder:text-text-faint focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-faint">Shift+Enter for newline</span>
                  <Button
                    size="sm"
                    onClick={handleChatSend}
                    disabled={!chatInput.trim()}
                    className="h-7 gap-1.5 rounded-lg bg-accent-ai px-3 text-xs text-white hover:bg-accent-ai/80 disabled:opacity-40"
                  >
                    <Send className="h-3 w-3" />
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Specs Tab */}
        <TabsContent value="specs" className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full flex-col gap-3 p-4">
            <Button
              onClick={handleGenerateSpec}
              disabled={isSpecGenerating}
              className="w-full rounded-xl bg-accent-ai text-white hover:bg-accent-ai/80 disabled:opacity-60"
            >
              {isSpecGenerating ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Generating…
                </>
              ) : (
                "Generate Spec"
              )}
            </Button>

            {specsLoading ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
              </div>
            ) : specs.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <FileText className="h-8 w-8 text-text-faint" />
                <p className="text-xs text-text-muted">No specs yet. Generate one above.</p>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="flex flex-col gap-2 pr-1">
                  {specs.map((spec) => (
                    <div
                      key={spec.id}
                      className="group flex cursor-pointer items-center gap-2 rounded-xl border border-border-subtle bg-bg-elevated px-3 py-2.5 transition-colors hover:border-border-default"
                      onClick={() => handleSpecClick(spec)}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-bg-subtle">
                        <FileText className="h-3.5 w-3.5 text-text-muted" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-text-primary">
                          {getFilename(spec.filePath)}
                        </p>
                        <p className="text-[10px] text-text-faint">
                          {formatSpecDate(spec.createdAt)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSpecDownload(spec.id)
                        }}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-text-faint opacity-0 transition-opacity hover:bg-bg-subtle hover:text-text-primary group-hover:opacity-100"
                      >
                        <Download className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </aside>
    </>
  )
}

function ArchitectureDraftPreview({
  proposal,
  summary,
  validation,
  isApplying,
  onApply,
  onClear,
}: {
  proposal: ArchitectureDraftProposal
  summary: ArchitectureDraftRunOutput["summary"] | null
  validation: ArchitectureDraftValidationResult[]
  isApplying: boolean
  onApply: () => void
  onClear: () => void
}) {
  const hasErrors = architectureDraftHasErrors(validation)
  const graphs = getArchitectureDraftGraphs(proposal)
  const visibleValidation = validation.filter((item) => item.severity !== "info")

  return (
    <div className="grid gap-3 rounded-2xl border border-border-subtle bg-bg-surface/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">
            {proposal.title}
          </p>
          <p className="mt-1 text-xs leading-5 text-text-muted">{proposal.summary}</p>
        </div>
        <div
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
            hasErrors
              ? "bg-red-500/10 text-red-300"
              : "bg-state-success/10 text-state-success"
          )}
        >
          {hasErrors ? "Blocked" : "Ready"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricPill label="Graphs" value={summary?.graphCount ?? graphs.length} />
        <MetricPill label="Layers" value={summary?.childLayerCount ?? graphs.filter((graph) => graph.parentGraphId || graph.parentNodeId || graph.parentNodeTempId).length} />
        <MetricPill label="Nodes" value={summary?.nodeCount ?? graphs.reduce((count, graph) => count + graph.nodes.length, 0)} />
        <MetricPill label="Edges" value={summary?.edgeCount ?? graphs.reduce((count, graph) => count + graph.edges.length, 0)} />
        <MetricPill label="Issues" value={visibleValidation.length} />
      </div>

      {proposal.clarificationQuestions.length > 0 ? (
        <div className="grid gap-1.5 rounded-xl border border-accent-ai/25 bg-accent-ai/10 p-2.5">
          <p className="text-[10px] font-semibold uppercase text-accent-ai-text">
            Clarification questions
          </p>
          {proposal.clarificationQuestions.slice(0, 4).map((question) => (
            <p key={question} className="text-[11px] leading-4 text-text-secondary">
              {question}
            </p>
          ))}
        </div>
      ) : null}

      {visibleValidation.length > 0 ? (
        <div className="grid gap-1.5">
          {visibleValidation.slice(0, 6).map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex gap-2 rounded-xl border px-2.5 py-2 text-xs",
                item.severity === "error"
                  ? "border-red-500/30 bg-red-500/10 text-red-200"
                  : "border-state-warning/30 bg-state-warning/10 text-state-warning"
              )}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {item.targetId ? `${item.targetId}: ` : ""}
                {item.message}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-state-success/25 bg-state-success/10 px-2.5 py-2 text-xs text-state-success">
          <Check className="h-3.5 w-3.5" />
          <span>No blocking safety issues.</span>
        </div>
      )}

      <ArchitectureDraftActions
        hasErrors={hasErrors}
        isApplying={isApplying}
        onApply={onApply}
        onClear={onClear}
        className="rounded-xl border border-accent-ai/25 bg-accent-ai/10 p-2"
      />

      <div className="grid gap-2">
        {graphs.map((graph, graphIndex) => {
          const graphKey = graph.graphId ?? `graph-${graphIndex}`
          return (
            <div key={graphKey} className="rounded-xl border border-border-default bg-bg-elevated p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-text-primary">
                    {graph.title ?? graph.graphId ?? proposal.title}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-text-faint">
                    {graph.graphId ?? proposal.targetGraphId}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-accent-primary/25 bg-accent-primary/10 px-2 py-0.5 text-[10px] text-accent-primary">
                  {`Layer ${graph.layer ?? graphIndex}`}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <MetricPill label="Nodes" value={graph.nodes.length} />
                <MetricPill label="Edges" value={graph.edges.length} />
              </div>
              {graph.layerKind || graph.summary ? (
                <p className="mt-2 text-[11px] leading-4 text-text-muted">
                  {graph.layerKind ? `${graph.layerKind}: ` : ""}
                  {graph.summary ?? ""}
                </p>
              ) : null}
              {graph.nodes.length > 0 ? (
                <div className="mt-2 grid gap-1">
                  {graph.nodes.slice(0, 6).map((node, nodeIndex) => (
                    <div key={`${graphKey}-node-${node.id ?? nodeIndex}`} className="min-w-0">
                      <p className="truncate text-xs font-medium text-text-primary">{node.label}</p>
                      <p className="truncate font-mono text-[10px] text-text-faint">
                        {node.id ?? "generated-id"} / {node.semanticType ?? node.type ?? "custom"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      {graphs.some((graph) => graph.edges.length > 0) ? (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-2.5">
          <p className="text-[10px] font-semibold uppercase text-text-faint">
            Relations
          </p>
          <div className="mt-2 grid gap-1.5">
            {graphs.flatMap((graph, graphIndex) =>
              graph.edges.slice(0, 6).map((edge, edgeIndex) => (
                <p
                  key={`${graph.graphId ?? graphIndex}-edge-${edge.id ?? edgeIndex}`}
                  className="truncate text-[11px] text-text-secondary"
                >
                  <span className="text-text-primary">{edge.source}</span>
                  <span className="text-text-faint"> {"->"} </span>
                  <span className="text-text-primary">{edge.target}</span>
                  <span className="text-text-faint"> / {edge.semanticType ?? edge.type ?? "relation"}</span>
                </p>
              ))
            ).slice(0, 12)}
          </div>
        </div>
      ) : null}

      {proposal.assumptions.length > 0 || proposal.suggestedNextSteps.length > 0 ? (
        <div className="grid gap-2 rounded-xl border border-border-default bg-bg-elevated p-2.5">
          {[...proposal.assumptions, ...proposal.suggestedNextSteps]
            .slice(0, 5)
            .map((item) => (
              <p key={item} className="text-[11px] leading-4 text-text-muted">
                {item}
              </p>
            ))}
        </div>
      ) : null}

      <ArchitectureDraftActions
        hasErrors={hasErrors}
        isApplying={isApplying}
        onApply={onApply}
        onClear={onClear}
        className="border-t border-border-default pt-3"
      />
    </div>
  )
}

function ArchitectureDraftActions({
  hasErrors,
  isApplying,
  onApply,
  onClear,
  className,
}: {
  hasErrors: boolean
  isApplying: boolean
  onApply: () => void
  onClear: () => void
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        size="sm"
        onClick={onApply}
        disabled={hasErrors || isApplying}
        className="h-8 flex-1 gap-1.5 rounded-lg bg-accent-ai px-3 text-xs text-white hover:bg-accent-ai/80 disabled:opacity-40"
      >
        {isApplying ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Check className="h-3 w-3" />
        )}
        {isApplying ? "Applying" : "Apply to canvas"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onClear}
        disabled={isApplying}
        className="h-8 gap-1.5 rounded-lg border-border-subtle px-3 text-xs text-text-secondary hover:border-border-default hover:text-text-primary"
      >
        <Trash2 className="h-3 w-3" />
        Clear
      </Button>
    </div>
  )
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated px-2.5 py-2">
      <p className="text-[10px] text-text-faint">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-text-primary">{value}</p>
    </div>
  )
}
