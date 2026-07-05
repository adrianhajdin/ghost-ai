"use client"

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react"
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
import { ChatFeedMessageSchema } from "@/types/tasks"
import { cn } from "@/lib/utils"
import { isTerminalAiRunStatus, useAiRunStatus } from "@/hooks/use-ai-run-status"
import { useRealtimeRoom } from "@/hooks/use-realtime-room"
import {
  AI_ASSISTANT_NAME,
  AI_WORKSPACE_TAGLINE,
  AI_WORKSPACE_TITLE,
} from "@/lib/branding"
import type { LlmCanvasImprovementProposal } from "@/lib/canvas/llm-canvas-patch-contract"
import type { LlmCanvasPatchPreviewResult } from "@/lib/canvas/llm-canvas-patch"

interface SpecItem {
  id: string
  filePath: string
  createdAt: string
}

interface ArchitectMessage {
  id: string
  role: "user" | "assistant"
  content: string
  graphId: string
  createdAt: string
  metadata?: unknown
}

interface ArchitectProviderMetadata {
  providerName: "mock" | "google" | "openai_compatible"
  isMockProvider: boolean
}

interface ArchitectReply {
  intent?: string
  assistantMessage?: {
    role: "assistant"
    content: string
  }
  canvasPatchProposal?: LlmCanvasImprovementProposal | null
  promptPackHandoff?: {
    recommended: boolean
    reason: string
    suggestedTargetAgents: string[]
    suggestedScopeMode: string
  }
  clarificationQuestions?: string[]
  assumptions?: string[]
  warnings?: string[]
  suggestedNextSteps?: string[]
}

interface ArchitectRunOutput {
  reply?: ArchitectReply
  assistantMessage?: ArchitectMessage
  summary?: {
    intent?: string
    canvasPatchOperationCount?: number
    promptPackRecommended?: boolean
    providerName?: ArchitectProviderMetadata["providerName"]
    isMockProvider?: boolean
  }
  provider?: ArchitectProviderMetadata
  canvasPyramidSummary?: {
    graphCount?: number
    nodeCount?: number
    edgeCount?: number
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
  projectId: string
  graphId: string
  selectedNodeIds: string[]
  onOpenPromptPack: () => void
  architectCommand?: {
    id: string
    message: string
  } | null
}

const ARCHITECT_STARTER_PROMPTS = [
  "Review this layer for missing architecture pieces",
  "Improve the selected node responsibilities",
  "Create a drill-down layer for the selected node",
]

function formatTime(createdAt: number): string {
  return new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function formatIsoTime(createdAt: string): string {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function scrollScrollAreaToBottom(scrollArea: HTMLDivElement | null) {
  const viewport = scrollArea?.querySelector<HTMLElement>(
    "[data-slot='scroll-area-viewport'], [data-radix-scroll-area-viewport]"
  )
  const scrollTarget = viewport ?? scrollArea
  if (scrollTarget) {
    scrollTarget.scrollTop = scrollTarget.scrollHeight
  }
}

function scrollScrollAreaToBottomAfterRender(scrollArea: HTMLDivElement | null) {
  scrollScrollAreaToBottom(scrollArea)
  const frameId = window.requestAnimationFrame(() => {
    scrollScrollAreaToBottom(scrollArea)
  })
  return () => window.cancelAnimationFrame(frameId)
}

function getArchitectStartErrorMessage(error: unknown) {
  if (error instanceof Error && error.message && error.message !== "Failed to fetch") {
    return error.message
  }
  return "Architect connection dropped. Reconnect and try again."
}

function getArchitectRunErrorMessage(error?: string) {
  if (error && error !== "Failed to fetch") return error
  return "Architect connection dropped. Reconnect and try again."
}

function getArchitectProviderCopy(provider: ArchitectProviderMetadata | null) {
  if (!provider || provider.providerName === "mock" || provider.isMockProvider) {
    return {
      label: "Mock mode",
      detail: "Mock provider — fixture replies",
      className: "border-state-warning/25 bg-state-warning/10 text-state-warning",
    }
  }

  if (provider.providerName === "google") {
    return {
      label: "Gemini / Google mode",
      detail: "Real LLM provider",
      className: "border-accent-ai/30 bg-accent-ai/10 text-accent-ai-text",
    }
  }

  return {
    label: "OpenAI-compatible mode",
    detail: "Real LLM provider",
    className: "border-accent-ai/30 bg-accent-ai/10 text-accent-ai-text",
  }
}

export function AiSidebar({
  isOpen,
  onClose,
  roomId,
  projectId,
  graphId,
  selectedNodeIds,
  onOpenPromptPack,
  architectCommand,
}: AiSidebarProps) {
  const {
    status: realtimeStatus,
    nodes,
    edges,
    currentUserName,
    chatMessages,
    setCanvasSnapshot,
    sendChatMessage,
    broadcastRoomEvent,
    patchPresence,
  } = useRealtimeRoom()
  const [chatInput, setChatInput] = useState("")
  const [chatError, setChatError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("architect")
  const [architectInput, setArchitectInput] = useState("")
  const [architectMessages, setArchitectMessages] = useState<ArchitectMessage[]>([])
  const [architectRunId, setArchitectRunId] = useState<string | null>(null)
  const [isArchitectThinking, setIsArchitectThinking] = useState(false)
  const [architectReply, setArchitectReply] = useState<ArchitectReply | null>(null)
  const [architectPatchProposal, setArchitectPatchProposal] =
    useState<LlmCanvasImprovementProposal | null>(null)
  const [architectError, setArchitectError] = useState<string | null>(null)
  const [architectApplyMessage, setArchitectApplyMessage] = useState<string | null>(null)
  const [architectProvider, setArchitectProvider] =
    useState<ArchitectProviderMetadata | null>(null)
  const [isClearingArchitectConversation, setIsClearingArchitectConversation] =
    useState(false)
  const [animatedArchitectMessageIds, setAnimatedArchitectMessageIds] = useState<Set<string>>(
    () => new Set()
  )
  const [isApplyingArchitectPatch, setIsApplyingArchitectPatch] = useState(false)
  const architectTextareaRef = useRef<HTMLTextAreaElement>(null)
  const architectScrollRef = useRef<HTMLDivElement>(null)
  const handledArchitectCommandRef = useRef<string | null>(null)
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null)
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

  const readReplyFromMessage = useCallback((message: ArchitectMessage) => {
    const metadata = message.metadata
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
    const reply = (metadata as { reply?: unknown }).reply
    if (!reply || typeof reply !== "object" || Array.isArray(reply)) return null
    return reply as ArchitectReply
  }, [])

  const fetchArchitectHistory = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/architect/conversation?graphId=${encodeURIComponent(graphId)}`
      )
      if (!response.ok) throw new Error("Failed to load Architect history")
      const data = (await response.json()) as {
        messages?: ArchitectMessage[]
        provider?: ArchitectProviderMetadata
      }
      const nextMessages = Array.isArray(data.messages) ? data.messages : []
      setArchitectMessages(nextMessages)
      if (data.provider) {
        setArchitectProvider(data.provider)
      }

      const latestReply = [...nextMessages]
        .reverse()
        .map(readReplyFromMessage)
        .find((reply): reply is ArchitectReply => Boolean(reply))
      setArchitectReply(latestReply ?? null)
      setArchitectPatchProposal(latestReply?.canvasPatchProposal ?? null)
    } catch {
      setArchitectMessages([])
      setArchitectReply(null)
      setArchitectPatchProposal(null)
    }
  }, [graphId, projectId, readReplyFromMessage])

  useEffect(() => {
    if (!isOpen) return
    const timeoutId = window.setTimeout(() => {
      void fetchArchitectHistory()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchArchitectHistory, isOpen])

  useLayoutEffect(() => {
    if (!isOpen) return undefined
    return scrollScrollAreaToBottomAfterRender(architectScrollRef.current)
  }, [
    architectApplyMessage,
    architectError,
    architectMessages.length,
    architectPatchProposal,
    architectReply?.promptPackHandoff?.recommended,
    isArchitectThinking,
    isOpen,
  ])

  const scrollArchitectToBottom = useCallback(() => {
    scrollScrollAreaToBottomAfterRender(architectScrollRef.current)
  }, [])

  const handleArchitectMessageStreamDone = useCallback((messageId: string) => {
    setAnimatedArchitectMessageIds((prev) => {
      if (!prev.has(messageId)) return prev
      const next = new Set(prev)
      next.delete(messageId)
      return next
    })
  }, [])

  const handleArchitectRunTerminal = useCallback(
    (status: string, output: unknown) => {
      setIsArchitectThinking(false)
      setArchitectRunId(null)
      patchPresence({ thinking: false })

      if (status !== "succeeded") {
        setArchitectError(getArchitectRunErrorMessage())
        broadcastRoomEvent({
          type: "ai.status",
          payload: {
            text: "Architect response failed.",
            status: "error",
          },
        })
        return
      }

      const typedOutput = output as ArchitectRunOutput | null
      if (!typedOutput?.reply) {
        setArchitectError("Architect response was empty. Retry the request.")
        return
      }

      if (typedOutput.provider) {
        setArchitectProvider(typedOutput.provider)
      } else if (typedOutput.summary?.providerName) {
        setArchitectProvider({
          providerName: typedOutput.summary.providerName,
          isMockProvider: Boolean(typedOutput.summary.isMockProvider),
        })
      }
      setArchitectReply(typedOutput.reply)
      setArchitectPatchProposal(typedOutput.reply.canvasPatchProposal ?? null)
      setArchitectError(null)
      setArchitectApplyMessage(null)

      if (typedOutput.assistantMessage) {
        const assistantMessage = typedOutput.assistantMessage
        setAnimatedArchitectMessageIds((prev) => {
          const next = new Set(prev)
          next.add(assistantMessage.id)
          return next
        })
        setArchitectMessages((prev) => {
          if (prev.some((message) => message.id === assistantMessage.id)) {
            return prev
          }
          return [...prev, assistantMessage]
        })
      }
      void fetchArchitectHistory()

      broadcastRoomEvent({
        type: "ai.status",
        payload: {
          text: typedOutput.reply.canvasPatchProposal
            ? "Architect proposed canvas changes."
            : "Architect replied.",
          status: "complete",
        },
      })
    },
    [broadcastRoomEvent, fetchArchitectHistory, patchPresence]
  )

  // Validated chat messages from the ai-chat feed, in chronological order
  const validatedChatMessages = chatMessages
    .map((msg) => {
      const parsed = ChatFeedMessageSchema.safeParse(msg)
      if (!parsed.success) return null
      return { id: msg.id, createdAt: msg.createdAt, ...parsed.data }
    })
    .filter((msg): msg is NonNullable<typeof msg> => msg !== null)
    .sort((a, b) => a.createdAt - b.createdAt)
  const collaboratorChatMessages = validatedChatMessages.filter(
    (msg) => msg.role === "user"
  )

  const handleGenerateSpec = useCallback(async () => {
    if (isSpecGenerating) return
    setIsSpecGenerating(true)

    const chatHistory = collaboratorChatMessages.map((msg) => ({
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
  }, [isSpecGenerating, roomId, nodes, edges, collaboratorChatMessages])

  // Keep the collaborator chat pinned to the latest room message.
  useEffect(() => {
    return scrollScrollAreaToBottomAfterRender(chatScrollRef.current)
  }, [collaboratorChatMessages.length])

  const handleArchitectInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setArchitectInput(e.target.value)
    const ta = e.target
    ta.style.height = "88px"
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`
  }, [])

  const sendArchitectMessage = useCallback(
    async (overrideMessage?: string) => {
      const message = (overrideMessage ?? architectInput).trim()
      if (!message || isArchitectThinking) return

      const tempMessage: ArchitectMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        content: message,
        graphId,
        createdAt: new Date().toISOString(),
      }
      setArchitectMessages((prev) => [...prev, tempMessage])
      setArchitectInput("")
      if (architectTextareaRef.current) {
        architectTextareaRef.current.style.height = "88px"
      }
      setArchitectError(null)
      setArchitectApplyMessage(null)
      setIsArchitectThinking(true)
      patchPresence({ thinking: true })
      broadcastRoomEvent({
        type: "ai.status",
        payload: {
          text: "Architect is reviewing the canvas.",
          status: "start",
        },
      })

      try {
        const response = await fetch("/api/ai/architect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            graphId,
            message,
            selectedNodeIds,
          }),
        })
        const data = (await response.json().catch(() => ({}))) as {
          runId?: string
          userMessage?: ArchitectMessage
          error?: string
        }

        if (!response.ok || !data.runId) {
          throw new Error(data.error ?? "Architect request failed")
        }

        if (data.userMessage) {
          setArchitectMessages((prev) =>
            prev.map((item) => (item.id === tempMessage.id ? data.userMessage! : item))
          )
        }
        setArchitectRunId(data.runId)
      } catch (error) {
        setIsArchitectThinking(false)
        patchPresence({ thinking: false })
        setArchitectMessages((prev) =>
          prev.filter((item) => item.id !== tempMessage.id)
        )
        setArchitectError(getArchitectStartErrorMessage(error))
        broadcastRoomEvent({
          type: "ai.status",
          payload: {
            text: "Failed to start Architect.",
            status: "error",
          },
        })
      }
    },
    [
      architectInput,
      broadcastRoomEvent,
      graphId,
      isArchitectThinking,
      patchPresence,
      projectId,
      selectedNodeIds,
    ]
  )

  const handleArchitectPreset = useCallback(
    (prompt: string) => {
      void sendArchitectMessage(prompt)
    },
    [sendArchitectMessage]
  )

  useEffect(() => {
    if (!architectCommand) return
    if (handledArchitectCommandRef.current === architectCommand.id) return
    if (isArchitectThinking) return

    handledArchitectCommandRef.current = architectCommand.id
    const commandMessage = architectCommand.message
    const commandTimer = window.setTimeout(() => {
      setActiveTab("architect")
      void sendArchitectMessage(commandMessage)
    }, 0)
    return () => window.clearTimeout(commandTimer)
  }, [architectCommand, isArchitectThinking, sendArchitectMessage])

  const handleArchitectKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        void sendArchitectMessage()
      }
    },
    [sendArchitectMessage]
  )

  const handleApplyArchitectPatch = useCallback(async () => {
    if (!architectPatchProposal || isApplyingArchitectPatch) return

    setIsApplyingArchitectPatch(true)
    setArchitectError(null)
    setArchitectApplyMessage(null)

    try {
      const response = await fetch(
        `/api/projects/${projectId}/architect/canvas-patch/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            graphId,
            proposal: architectPatchProposal,
          }),
        }
      )
      const data = (await response.json().catch(() => ({}))) as {
        error?: string
        canvas?: { nodes: typeof nodes; edges: typeof edges }
        applied?: { operations?: number; skippedOperations?: number }
        issues?: Array<{ message: string; severity: "warning" | "error" }>
      }

      if (!response.ok) {
        throw new Error(data.error ?? "Architect canvas patch failed")
      }

      if (data.canvas) {
        setCanvasSnapshot(data.canvas)
      }

      const appliedOps = data.applied?.operations ?? architectPatchProposal.operations.length
      const skippedOps = data.applied?.skippedOperations ?? 0
      const firstIssue = data.issues?.[0]?.message
      const skippedSummary = skippedOps ? `, skipped ${skippedOps}` : ""
      const issueSummary = skippedOps && firstIssue ? `: ${firstIssue}` : ""
      setArchitectApplyMessage(
        `Applied ${appliedOps} canvas operation${appliedOps === 1 ? "" : "s"}${skippedSummary}${issueSummary}.`
      )
      setArchitectPatchProposal(null)
      broadcastRoomEvent({
        type: "ai.status",
        payload: {
          text: "Architect canvas changes applied.",
          status: "complete",
        },
      })
    } catch (error) {
      setArchitectError(
        error instanceof Error ? error.message : "Architect canvas patch failed."
      )
    } finally {
      setIsApplyingArchitectPatch(false)
    }
  }, [
    architectPatchProposal,
    broadcastRoomEvent,
    graphId,
    isApplyingArchitectPatch,
    projectId,
    setCanvasSnapshot,
  ])

  const handleClearArchitectPatch = useCallback(() => {
    setArchitectPatchProposal(null)
    setArchitectApplyMessage(null)
  }, [])

  const handleClearArchitectConversation = useCallback(async () => {
    if (isClearingArchitectConversation) return
    const confirmed = window.confirm(
      "Clear Architect conversation for this project? Canvas will not be changed."
    )
    if (!confirmed) return

    setIsClearingArchitectConversation(true)
    setArchitectError(null)
    setArchitectApplyMessage(null)

    try {
      const response = await fetch(
        `/api/projects/${projectId}/architect/conversation?graphId=${encodeURIComponent(graphId)}`,
        { method: "DELETE" }
      )
      const data = (await response.json().catch(() => ({}))) as {
        deletedCount?: number
        error?: string
      }

      if (!response.ok) {
        throw new Error(data.error ?? "Architect conversation reset failed")
      }

      setArchitectMessages([])
      setArchitectReply(null)
      setArchitectPatchProposal(null)
      setAnimatedArchitectMessageIds(new Set())
      setArchitectApplyMessage(
        `Architect conversation cleared${
          typeof data.deletedCount === "number" ? ` (${data.deletedCount})` : ""
        }. Canvas was not changed.`
      )
    } catch (error) {
      setArchitectError(
        getArchitectRunErrorMessage(error instanceof Error ? error.message : undefined)
      )
    } finally {
      setIsClearingArchitectConversation(false)
    }
  }, [graphId, isClearingArchitectConversation, projectId])

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

  const architectHandoff = architectReply?.promptPackHandoff
  const isAiBusy = isArchitectThinking || isApplyingArchitectPatch || isSpecGenerating
  const providerCopy = getArchitectProviderCopy(architectProvider)
  const showRealtimeWarning =
    realtimeStatus === "disconnected" || realtimeStatus === "error"

  return (
    <>
      {specRunId && (
        <RunTracker
          runId={specRunId}
          onTerminal={handleSpecRunTerminal}
        />
      )}
      {architectRunId && (
        <RunTracker
          runId={architectRunId}
          onTerminal={handleArchitectRunTerminal}
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

    {isOpen ? (
      <button
        type="button"
        aria-label="Close AI Workspace overlay"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] lg:hidden"
      />
    ) : null}

    <aside
      className={cn(
        "fixed inset-x-2 bottom-2 top-[3.25rem] z-50 flex flex-col rounded-3xl border border-border-subtle bg-bg-surface/95 shadow-xl ring-1 ring-accent-ai/10 backdrop-blur-xl transition-[transform,opacity] duration-300 lg:inset-x-auto lg:inset-y-3 lg:right-3 lg:top-15 lg:w-84",
        isOpen
          ? "translate-x-0 translate-y-0 opacity-100"
          : "pointer-events-none translate-y-[calc(100%+1rem)] opacity-0 lg:translate-x-[calc(100%+1rem)] lg:translate-y-0"
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border-default px-4 py-3 lg:px-5 lg:py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-ai/15">
          <Bot className="h-4 w-4 text-accent-ai-text" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">{AI_WORKSPACE_TITLE}</p>
          <p className="text-xs text-text-muted [@media(max-height:460px)]:hidden">
            {AI_WORKSPACE_TAGLINE}
          </p>
        </div>
        {isAiBusy && (
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
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <TabsList className="mx-3 mt-2 grid h-auto w-auto shrink-0 grid-cols-3 rounded-xl bg-bg-subtle p-1 lg:mx-4 lg:mt-3">
          <TabsTrigger
            value="architect"
            className="rounded-lg px-3 py-1.5 text-xs font-medium data-active:bg-accent-ai data-active:text-white data-active:shadow-none"
          >
            Architect
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

        {/* Architect Tab */}
        <TabsContent value="architect" className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-border-default bg-bg-surface/95 px-3 py-2 lg:px-4 lg:py-3">
              <div className="grid gap-2 lg:gap-3">
                <div className="grid grid-cols-3 gap-2 [@media(max-height:460px)]:hidden">
                  <MetricPill label="Nodes" value={nodes.length} />
                  <MetricPill label="Edges" value={edges.length} />
                  <MetricPill label="Selected" value={selectedNodeIds.length} />
                </div>

                <div className="rounded-2xl border border-accent-ai/20 bg-accent-ai/10 p-2.5 lg:p-3">
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-ai-text" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-text-primary">
                        {AI_ASSISTANT_NAME}
                      </p>
                      <p className="mt-1 break-all font-mono text-[10px] text-text-faint">
                        {graphId}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 lg:mt-3">
                    <div
                      className={cn(
                        "min-w-0 rounded-full border px-2.5 py-1 text-[10px]",
                        providerCopy.className
                      )}
                      title={providerCopy.detail}
                    >
                      <span className="block truncate font-semibold">{providerCopy.label}</span>
                      <span className="block truncate opacity-80">{providerCopy.detail}</span>
                    </div>
                    <button
                      type="button"
                      aria-label="Clear Architect conversation"
                      onClick={handleClearArchitectConversation}
                      disabled={
                        isClearingArchitectConversation ||
                        (architectMessages.length === 0 && !architectReply)
                      }
                      className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-border-subtle bg-bg-elevated px-2 text-[10px] text-text-muted transition-colors hover:border-border-default hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isClearingArchitectConversation ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      Reset
                    </button>
                  </div>
                </div>

                {showRealtimeWarning ? (
                  <div className="flex gap-2 rounded-xl border border-state-warning/30 bg-state-warning/10 px-3 py-2 text-xs text-state-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>Realtime disconnected — canvas may not be fully synced.</span>
                  </div>
                ) : null}
              </div>
            </div>

            <ScrollArea
              className="min-h-0 flex-1 overflow-hidden"
              ref={architectScrollRef as React.Ref<HTMLDivElement>}
            >
              <div className="grid gap-3 px-4 py-3 pb-4">
                {architectMessages.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-border-subtle bg-bg-elevated px-4 py-8 text-center">
                    <Bot className="h-6 w-6 text-accent-ai-text" />
                    <div>
                      <p className="text-sm font-medium text-text-primary">Architect thread</p>
                      <p className="mt-1 text-xs leading-5 text-text-muted">
                        Ask for one canvas change at a time.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {architectMessages.map((message) => {
                      const isUser = message.role === "user"
                      const shouldAnimate =
                        !isUser && animatedArchitectMessageIds.has(message.id)
                      const replyDetails = isUser ? null : readReplyFromMessage(message)
                      return (
                        <div
                          key={message.id}
                          className={cn(
                            "flex flex-col gap-1",
                            isUser ? "items-end" : "items-start"
                          )}
                        >
                          <div
                            className={cn(
                              "flex items-center gap-1.5 text-[10px] text-text-faint",
                              isUser && "flex-row-reverse"
                            )}
                          >
                            <span className="font-medium text-text-muted">
                              {isUser ? "You" : AI_ASSISTANT_NAME}
                            </span>
                            <span>{formatIsoTime(message.createdAt)}</span>
                          </div>
                          <div
                            className={cn(
                              "max-w-[88%] rounded-2xl px-3 py-2 text-xs leading-5 text-text-primary",
                              isUser
                                ? "whitespace-pre-wrap rounded-br-sm bg-accent-ai font-medium text-white"
                                : "rounded-bl-sm border border-border-subtle bg-bg-elevated"
                            )}
                            aria-live={shouldAnimate ? "polite" : undefined}
                          >
                            {isUser ? (
                              message.content
                            ) : (
                              <StreamingArchitectMessageContent
                                content={message.content}
                                animate={shouldAnimate}
                                onStep={scrollArchitectToBottom}
                                onDone={() => handleArchitectMessageStreamDone(message.id)}
                              />
                            )}
                          </div>
                          {!isUser && replyDetails ? (
                            <ArchitectReplyDetails reply={replyDetails} />
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}

                {isArchitectThinking ? (
                  <div className="flex items-center gap-2 rounded-xl border border-accent-ai/20 bg-accent-ai/10 px-3 py-2 text-xs text-accent-ai-text">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Architect is reading the canvas pyramid...</span>
                  </div>
                ) : null}

                {architectError ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {architectError}
                  </div>
                ) : null}

                {architectApplyMessage ? (
                  <div className="rounded-xl border border-state-success/25 bg-state-success/10 px-3 py-2 text-xs text-state-success">
                    {architectApplyMessage}
                  </div>
                ) : null}

                {architectPatchProposal ? (
                  <ArchitectPatchPreview
                    proposal={architectPatchProposal}
                    isApplying={isApplyingArchitectPatch}
                    onApply={handleApplyArchitectPatch}
                    onClear={handleClearArchitectPatch}
                  />
                ) : null}

                {architectHandoff?.recommended ? (
                  <div className="grid gap-2 rounded-2xl border border-accent-primary/25 bg-accent-primary-dim p-3">
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-text-primary">
                          Prompt Pack handoff
                        </p>
                        <p className="mt-1 text-[11px] leading-4 text-text-muted">
                          {architectHandoff.reason || "The architecture is ready for an implementation prompt."}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      type="button"
                      onClick={onOpenPromptPack}
                      className="h-8 rounded-lg bg-accent-primary px-3 text-xs font-medium text-bg-base hover:bg-accent-primary/90"
                    >
                      Open Prompt Pack
                    </Button>
                  </div>
                ) : null}
              </div>
            </ScrollArea>

            <div className="shrink-0 border-t border-border-default p-3">
              <div className="grid gap-2 rounded-2xl border border-border-subtle bg-bg-elevated p-3">
                <Textarea
                  ref={architectTextareaRef}
                  value={architectInput}
                  onChange={handleArchitectInputChange}
                  onKeyDown={handleArchitectKeyDown}
                  placeholder="Tell Architect what to change on this canvas..."
                  disabled={isArchitectThinking}
                  style={{ height: "88px", maxHeight: "180px" }}
                  className="resize-none overflow-y-auto border-0 bg-transparent px-0 py-0 pr-2 text-sm text-text-primary shadow-none placeholder:text-text-faint focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] text-text-faint">
                    {selectedNodeIds.length
                      ? `${selectedNodeIds.length} selected`
                      : "Current layer"}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => void sendArchitectMessage()}
                    disabled={!architectInput.trim() || isArchitectThinking}
                    className="h-8 gap-1.5 rounded-lg bg-accent-ai px-3 text-xs text-white hover:bg-accent-ai/80 disabled:opacity-40"
                  >
                    {isArchitectThinking ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    Send
                  </Button>
                </div>
                <div className="grid gap-2 pt-1">
                  {ARCHITECT_STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => handleArchitectPreset(prompt)}
                      disabled={isArchitectThinking}
                      className="w-full rounded-xl border border-border-default bg-bg-subtle px-3 py-2 text-left text-xs text-accent-ai-text transition-colors hover:border-accent-ai/50 hover:bg-accent-ai/10 disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
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
                {collaboratorChatMessages.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 py-8 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent-primary/25 bg-accent-primary-dim">
                      <MessageSquare className="h-5 w-5 text-accent-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">Project Chat</p>
                      <p className="mt-1 text-xs leading-5 text-text-muted">
                        Discuss architecture decisions with collaborators.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 pb-2">
                    {collaboratorChatMessages.map((msg) => {
                      const isMe = msg.sender === currentUserName
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
                              {msg.sender}
                            </span>
                            <span>{formatTime(msg.createdAt)}</span>
                          </div>
                          <div
                            className={cn(
                              "max-w-[85%] rounded-2xl px-3 py-2 text-xs text-text-primary",
                              isMe
                                ? "rounded-br-sm bg-accent-primary font-medium text-bg-base"
                                : "rounded-bl-sm border border-border-subtle bg-bg-elevated"
                            )}
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
                  placeholder="Message collaborators…"
                  style={{ height: "72px", maxHeight: "160px" }}
                  className="resize-none overflow-y-auto border-0 bg-transparent px-0 py-0 pr-2 text-sm text-text-primary shadow-none placeholder:text-text-faint focus-visible:ring-0 focus-visible:ring-offset-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-faint">Shift+Enter for newline</span>
                  <Button
                    size="sm"
                    onClick={handleChatSend}
                    disabled={!chatInput.trim()}
                    className="h-7 gap-1.5 rounded-lg bg-accent-primary px-3 text-xs font-medium text-bg-base hover:bg-accent-primary/90 disabled:opacity-40"
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

function StreamingArchitectMessageContent({
  content,
  animate,
  onStep,
  onDone,
}: {
  content: string
  animate: boolean
  onStep: () => void
  onDone: () => void
}) {
  const [visibleLength, setVisibleLength] = useState(animate ? 0 : content.length)
  const onStepRef = useRef(onStep)
  const onDoneRef = useRef(onDone)
  const visibleContent = animate ? content.slice(0, visibleLength) : content

  useEffect(() => {
    onStepRef.current = onStep
    onDoneRef.current = onDone
  }, [onDone, onStep])

  useEffect(() => {
    if (!animate) return

    let cursor = 0

    const intervalId = window.setInterval(() => {
      const remaining = content.length - cursor
      const step = remaining > 480 ? 12 : remaining > 220 ? 8 : 4
      cursor = Math.min(content.length, cursor + step)
      setVisibleLength(cursor)
      onStepRef.current()

      if (cursor >= content.length) {
        window.clearInterval(intervalId)
        onDoneRef.current()
      }
    }, 26)

    return () => window.clearInterval(intervalId)
  }, [animate, content])

  return (
    <div className="space-y-1.5">
      <MessageBodyText content={visibleContent} />
      {animate && visibleContent.length < content.length ? (
        <span className="ml-0.5 inline-block h-3 w-1 translate-y-0.5 animate-pulse rounded-full bg-accent-ai-text" />
      ) : null}
    </div>
  )
}

function MessageBodyText({ content }: { content: string }) {
  const lines = content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return null

  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => {
        const bulletMatch = line.match(/^[-*\u2022]\s+(.*)$/)
        if (bulletMatch) {
          return (
            <div key={`${line}-${index}`} className="flex gap-2">
              <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-accent-ai-text/80" />
              <span>{bulletMatch[1]}</span>
            </div>
          )
        }

        return <p key={`${line}-${index}`}>{line}</p>
      })}
    </div>
  )
}

function ArchitectReplyDetails({ reply }: { reply: ArchitectReply }) {
  const clarificationQuestions = (reply.clarificationQuestions ?? [])
    .map((question) => question.trim())
    .filter(Boolean)
    .slice(0, 3)
  const secondaryNotes = [
    ...(reply.assumptions ?? []).map((item) => ({ label: "Assumption", item })),
    ...(reply.warnings ?? []).map((item) => ({ label: "Warning", item })),
  ].filter((note) => note.item.trim())

  if (clarificationQuestions.length === 0 && secondaryNotes.length === 0) {
    return null
  }

  return (
    <div className="max-w-[88%] space-y-2">
      {clarificationQuestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {clarificationQuestions.map((question) => (
            <span
              key={question}
              className="rounded-full border border-accent-ai/25 bg-accent-ai/10 px-2 py-1 text-[10px] leading-4 text-accent-ai-text"
            >
              {question}
            </span>
          ))}
        </div>
      ) : null}

      {secondaryNotes.length > 0 ? (
        <details className="rounded-xl border border-border-default bg-bg-subtle px-3 py-2 text-[10px] text-text-muted">
          <summary className="cursor-pointer select-none text-text-muted">
            Assumptions / warnings
          </summary>
          <div className="mt-2 grid gap-1.5">
            {secondaryNotes.slice(0, 5).map((note, index) => (
              <p key={`${note.label}-${index}`}>
                <span className="font-semibold text-text-secondary">{note.label}: </span>
                {note.item}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  )
}

function ArchitectPatchPreview({
  proposal,
  isApplying,
  onApply,
  onClear,
}: {
  proposal: LlmCanvasImprovementProposal
  isApplying: boolean
  onApply: () => void
  onClear: () => void
}) {
  const preview = (proposal as LlmCanvasImprovementProposal & {
    preview?: LlmCanvasPatchPreviewResult
  }).preview
  const unsupportedCount = proposal.operations.filter((operation) => {
    if (!operation || typeof operation !== "object" || !("op" in operation)) return true
    return ![
      "update-node",
      "update-edge",
      "add-node",
      "add-edge",
      "create-layer",
      "update-graph",
    ].includes(String(operation.op))
  }).length
  const blockingIssueCount = preview?.blockingIssueCount ?? 0
  const canApply = Boolean(preview ? preview.canApply : proposal.operations.length > 0)
  const affectedGraphIds = preview?.affectedGraphIds ?? []
  const previewOperations = preview?.operations ?? []

  return (
    <div className="grid gap-3 rounded-2xl border border-accent-ai/25 bg-accent-ai/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary">Canvas patch proposal</p>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            {proposal.summary || "Architect proposed canvas changes."}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-accent-ai/30 bg-bg-elevated px-2 py-0.5 text-[10px] text-accent-ai-text">
          {proposal.operations.length} ops
        </span>
      </div>

      {blockingIssueCount > 0 ? (
        <div className="flex gap-2 rounded-xl border border-state-error/35 bg-state-error/10 px-2.5 py-2 text-xs text-state-error">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{blockingIssueCount} blocking issue(s). Fix the proposal before apply.</span>
        </div>
      ) : unsupportedCount > 0 ? (
        <div className="flex gap-2 rounded-xl border border-state-warning/30 bg-state-warning/10 px-2.5 py-2 text-xs text-state-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{unsupportedCount} unsupported operation(s) will be skipped.</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-state-success/25 bg-state-success/10 px-2.5 py-2 text-xs text-state-success">
          <Check className="h-3.5 w-3.5" />
          <span>
            {preview ? "Preview validated for user-approved apply." : "Ready for user-approved apply."}
          </span>
        </div>
      )}

      {affectedGraphIds.length > 0 ? (
        <div className="grid gap-1.5">
          <p className="text-[10px] font-semibold uppercase text-text-faint">
            Affected graphs
          </p>
          <div className="flex flex-wrap gap-1.5">
            {affectedGraphIds.map((graphId) => (
              <span
                key={graphId}
                className="max-w-full truncate rounded-full border border-accent-primary/25 bg-accent-primary-dim px-2 py-1 font-mono text-[10px] text-accent-primary"
              >
                {graphId}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {preview?.issues.length ? (
        <div className="grid gap-1.5">
          {preview.issues.slice(0, 4).map((item) => (
            <div
              key={`${item.operationIndex}-${item.message}`}
              className={cn(
                "flex gap-2 rounded-xl border px-2.5 py-2 text-xs",
                item.blocking
                  ? "border-state-error/35 bg-state-error/10 text-state-error"
                  : "border-state-warning/30 bg-state-warning/10 text-state-warning"
              )}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-2">
        {(previewOperations.length > 0 ? previewOperations : proposal.operations).slice(0, 6).map((operation, index) => {
          const opName =
            operation && typeof operation === "object" && "op" in operation
              ? String(operation.op)
              : "unknown"
          const graphId =
            operation && typeof operation === "object" && "targetGraphId" in operation
              ? String(operation.targetGraphId ?? "pending")
              : operation && typeof operation === "object" && "graphId" in operation
                ? String(operation.graphId)
                : operation && typeof operation === "object" && "parentGraphId" in operation
                  ? String(operation.parentGraphId)
                  : "canvas"
          const status =
            operation && typeof operation === "object" && "status" in operation
              ? String(operation.status)
              : "canvas"
          const summary =
            operation && typeof operation === "object" && "summary" in operation
              ? String(operation.summary)
              : opName
          return (
            <div
              key={`${opName}-${index}`}
              className="rounded-xl border border-border-default bg-bg-elevated px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-text-primary">{opName}</p>
                {previewOperations.length > 0 ? (
                  <span className="rounded-full border border-border-subtle px-1.5 py-0.5 text-[9px] uppercase text-text-faint">
                    {status}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-text-secondary">
                {summary}
              </p>
              <p className="mt-1 truncate font-mono text-[10px] text-text-faint">
                {graphId}
              </p>
            </div>
          )
        })}
      </div>

      {preview?.tempIdMappings.length ? (
        <details className="rounded-xl border border-border-default bg-bg-elevated px-3 py-2 text-[10px] text-text-muted">
          <summary className="cursor-pointer select-none text-text-secondary">
            Temp ID mappings
          </summary>
          <div className="mt-2 grid gap-1">
            {preview.tempIdMappings.slice(0, 8).map((mapping) => (
              <p key={`${mapping.graphId}-${mapping.tempId}-${mapping.resolvedId}`} className="truncate font-mono">
                {mapping.tempId} → {mapping.resolvedId}
              </p>
            ))}
          </div>
        </details>
      ) : null}

      <div className="flex items-center gap-2 border-t border-border-default pt-3">
        <Button
          size="sm"
          onClick={onApply}
          disabled={isApplying || proposal.operations.length === 0 || !canApply}
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
