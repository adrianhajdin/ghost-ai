"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { CanvasSnapshot } from "@/lib/canvas/canvas-state"
import { emptyCanvasSnapshot, sanitizeCanvasSnapshot } from "@/lib/canvas/canvas-state"
import type { CanvasDocV1, CanvasScopeKind } from "@/lib/canvas/canvas-doc"
import { ROOT_GRAPH_ID } from "@/lib/canvas/graph-ids"
import { getPublicRealtimeUrl } from "@/lib/realtime/realtime-url"
import type {
  RealtimeClientMessage,
  RealtimePresence,
  RealtimePresenceRecord,
  RealtimeRoomEvent,
  RealtimeServerMessage,
  JsonValue,
} from "@/lib/realtime/types"
import type { CanvasEdge, CanvasNode } from "@/types/canvas"
import type { ChatFeedMessage, AiStatusFeedMessage } from "@/types/tasks"
import { useCurrentUser } from "@/hooks/use-current-user"

type RealtimeConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"

interface RealtimeTokenResponse {
  token: string
}

interface RealtimeRoomContextValue {
  projectId: string
  roomId: string
  graphId: string
  graphTitle: string
  graphScopeKind: CanvasScopeKind
  parentGraphId: string | null
  parentNodeId: string | null
  graphLayer: number | null
  graphLayerKind: string | null
  graphSummary: string | null
  currentUserName: string
  status: RealtimeConnectionStatus
  error: string | null
  connectionId: string | null
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  setCanvasSnapshot: (
    snapshot: CanvasSnapshot,
    options?: { broadcast?: boolean; recordHistory?: boolean }
  ) => void
  presence: RealtimePresenceRecord[]
  updatePresence: (presence: RealtimePresence | null) => void
  patchPresence: (patch: RealtimePresence) => void
  chatMessages: Array<ChatFeedMessage & { id: string; createdAt: number }>
  aiStatuses: Array<AiStatusFeedMessage & { id: string; createdAt: number }>
  sendChatMessage: (
    content: string,
    options?: { role?: ChatFeedMessage["role"]; sender?: string }
  ) => boolean
  broadcastRoomEvent: (event: RealtimeRoomEvent) => boolean
}

const RealtimeRoomContext = createContext<RealtimeRoomContextValue | null>(null)

function parseServerMessage(raw: string): RealtimeServerMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === "object" && parsed !== null && "type" in parsed
      ? (parsed as RealtimeServerMessage)
      : null
  } catch {
    return null
  }
}

function timestampFromPayload(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "timestamp" in payload &&
    typeof payload.timestamp === "string"
  ) {
    const parsed = Date.parse(payload.timestamp)
    if (Number.isFinite(parsed)) return parsed
  }

  return Date.now()
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function toRealtimePayload(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

export function InternalRealtimeProvider({
  projectId,
  roomId,
  graphId = ROOT_GRAPH_ID,
  children,
}: {
  projectId: string
  roomId: string
  graphId?: string
  children: React.ReactNode
}) {
  const { user } = useCurrentUser()
  const currentUserName = user?.name ?? user?.email ?? "Unknown"
  const socketRef = useRef<WebSocket | null>(null)
  const connectRef = useRef<(() => Promise<void>) | null>(null)
  const selfPresenceRef = useRef<RealtimePresence>({})
  const reconnectTimeoutRef = useRef<number | null>(null)
  const shouldReconnectRef = useRef(false)
  const [status, setStatus] = useState<RealtimeConnectionStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [edges, setEdges] = useState<CanvasEdge[]>([])
  const [graphTitle, setGraphTitle] = useState(graphId === ROOT_GRAPH_ID ? "System" : "Design layer")
  const [graphScopeKind, setGraphScopeKind] = useState<CanvasScopeKind>(
    graphId === ROOT_GRAPH_ID ? "system-root" : "architecture-layer"
  )
  const [parentGraphId, setParentGraphId] = useState<string | null>(null)
  const [parentNodeId, setParentNodeId] = useState<string | null>(null)
  const [graphLayer, setGraphLayer] = useState<number | null>(null)
  const [graphLayerKind, setGraphLayerKind] = useState<string | null>(null)
  const [graphSummary, setGraphSummary] = useState<string | null>(null)
  const [presence, setPresence] = useState<RealtimePresenceRecord[]>([])
  const [chatMessages, setChatMessages] = useState<Array<ChatFeedMessage & { id: string; createdAt: number }>>([])
  const [aiStatuses, setAiStatuses] = useState<Array<AiStatusFeedMessage & { id: string; createdAt: number }>>([])

  const sendMessage = useCallback((message: RealtimeClientMessage) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false
    socketRef.current.send(JSON.stringify(message))
    return true
  }, [])

  const broadcastRoomEvent = useCallback(
    (event: RealtimeRoomEvent) =>
      sendMessage({
        type: "event.broadcast",
        event,
      }),
    [sendMessage]
  )

  const setCanvasSnapshot = useCallback(
    (
      snapshot: CanvasSnapshot,
      options: { broadcast?: boolean; recordHistory?: boolean } = {}
    ) => {
      const canvas = sanitizeCanvasSnapshot(snapshot)
      setNodes(canvas.nodes)
      setEdges(canvas.edges)

      if (options.broadcast) {
        broadcastRoomEvent({
          type: "canvas.snapshot",
          payload: toRealtimePayload(canvas),
        })
      }
    },
    [broadcastRoomEvent]
  )

  const updatePresence = useCallback(
    (nextPresence: RealtimePresence | null) => {
      selfPresenceRef.current = nextPresence ?? {}
      sendMessage({ type: "presence.update", presence: nextPresence })
    },
    [sendMessage]
  )

  const patchPresence = useCallback(
    (patch: RealtimePresence) => {
      const nextPresence = {
        ...selfPresenceRef.current,
        ...patch,
      }
      selfPresenceRef.current = nextPresence
      sendMessage({ type: "presence.update", presence: nextPresence })
    },
    [sendMessage]
  )

  const sendChatMessage = useCallback(
    (content: string, options: { role?: ChatFeedMessage["role"]; sender?: string } = {}) => {
      const text = content.trim()
      if (!text) return false

      const message: ChatFeedMessage = {
        sender: options.sender ?? currentUserName,
        role: options.role ?? "user",
        content: text,
        timestamp: new Date().toISOString(),
      }
      const localMessage = {
        ...message,
        id: createLocalId("chat"),
        createdAt: Date.now(),
      }
      setChatMessages((current) => [...current, localMessage])

      return broadcastRoomEvent({
        type: "chat.message",
        payload: toRealtimePayload(message),
      })
    },
    [broadcastRoomEvent, currentUserName]
  )

  const handleRoomEvent = useCallback((event: RealtimeRoomEvent, idPrefix: string) => {
    if (event.type === "canvas.snapshot") {
      setCanvasSnapshot(sanitizeCanvasSnapshot(event.payload))
      return
    }

    if (event.type === "chat.message") {
      const payload = event.payload as Partial<ChatFeedMessage>
      const sender = payload.sender
      const role = payload.role
      const content = payload.content
      const timestamp = payload.timestamp
      if (
        typeof sender !== "string" ||
        (role !== "user" && role !== "assistant") ||
        typeof content !== "string" ||
        typeof timestamp !== "string"
      ) {
        return
      }

      setChatMessages((current) => [
        ...current,
        {
          sender,
          role,
          content,
          timestamp,
          id: createLocalId(idPrefix),
          createdAt: timestampFromPayload(payload),
        },
      ])
      return
    }

    if (event.type === "ai.status") {
      const payload = event.payload as Partial<AiStatusFeedMessage>
      setAiStatuses((current) => [
        ...current,
        {
          text: typeof payload.text === "string" ? payload.text : undefined,
          status:
            payload.status === "start" ||
            payload.status === "thinking" ||
            payload.status === "complete" ||
            payload.status === "error"
              ? payload.status
              : undefined,
          id: createLocalId(idPrefix),
          createdAt: Date.now(),
        },
      ])
    }
  }, [setCanvasSnapshot])

  useEffect(() => {
    let cancelled = false

    fetch(`/api/projects/${projectId}/canvas?graphId=${encodeURIComponent(graphId)}`)
      .then((res) => (res.ok ? res.json() : { canvas: null }))
      .then(({ canvas, doc }: { canvas: CanvasSnapshot | null; doc?: CanvasDocV1 | null }) => {
        if (cancelled) return
        if (doc) {
          setGraphTitle(doc.title)
          setGraphScopeKind(doc.scopeKind)
          setParentGraphId(doc.parentGraphId)
          setParentNodeId(doc.parentNodeId)
          setGraphLayer(doc.layer)
          setGraphLayerKind(doc.layerKind)
          setGraphSummary(doc.summary)
        }
        setCanvasSnapshot(canvas ? sanitizeCanvasSnapshot(canvas) : emptyCanvasSnapshot())
      })
      .catch(() => {
        if (!cancelled) setCanvasSnapshot(emptyCanvasSnapshot())
      })

    return () => {
      cancelled = true
    }
  }, [graphId, projectId, setCanvasSnapshot])

  const scheduleReconnect = useCallback(() => {
    if (!shouldReconnectRef.current) return

    reconnectTimeoutRef.current = window.setTimeout(() => {
      connectRef.current?.().catch(() => {
        setStatus("error")
        setError("Realtime reconnect failed")
      })
    }, 1500)
  }, [])

  const connect = useCallback(async () => {
    if (!projectId || !roomId) return

    shouldReconnectRef.current = true
    setStatus("connecting")
    setError(null)

    const response = await fetch("/api/realtime/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, roomId }),
    })

    if (!response.ok) {
      setStatus("error")
      setError("Unable to authorize realtime room")
      return
    }

    const tokenResponse = (await response.json()) as RealtimeTokenResponse
    const websocketUrl = new URL(getPublicRealtimeUrl())
    websocketUrl.searchParams.set("token", tokenResponse.token)

    const socket = new WebSocket(websocketUrl.toString())
    socketRef.current = socket

    socket.onopen = () => {
      setStatus("connected")
    }

    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return

      const message = parseServerMessage(event.data)
      if (!message) return

      if (message.type === "room.joined") {
        setConnectionId(message.connectionId)
        return
      }

      if (message.type === "presence.snapshot") {
        setPresence(message.presence)
        return
      }

      if (message.type === "presence.updated") {
        setPresence((current) => {
          const filtered = current.filter(
            (record) => record.connectionId !== message.connectionId
          )
          if (!message.presence) return filtered
          return [
            ...filtered,
            {
              connectionId: message.connectionId,
              userId: message.userId,
              presence: message.presence,
            },
          ]
        })
        return
      }

      if (message.type === "event.broadcast") {
        handleRoomEvent(message.event, message.connectionId)
      }
    }

    socket.onerror = () => {
      setStatus("error")
      setError("Realtime connection failed")
    }

    socket.onclose = () => {
      socketRef.current = null
      setStatus("disconnected")

      scheduleReconnect()
    }
  }, [handleRoomEvent, projectId, roomId, scheduleReconnect])

  useEffect(() => {
    connectRef.current = connect

    return () => {
      if (connectRef.current === connect) {
        connectRef.current = null
      }
    }
  }, [connect])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      connect().catch(() => {
        setStatus("error")
        setError("Realtime connection failed")
      })
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
      shouldReconnectRef.current = false

      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      socketRef.current?.close()
      socketRef.current = null
    }
  }, [connect])

  const value = useMemo<RealtimeRoomContextValue>(
    () => ({
      projectId,
      roomId,
      graphId,
      graphTitle,
      graphScopeKind,
      parentGraphId,
      parentNodeId,
      graphLayer,
      graphLayerKind,
      graphSummary,
      currentUserName,
      status,
      error,
      connectionId,
      nodes,
      edges,
      setCanvasSnapshot,
      presence,
      updatePresence,
      patchPresence,
      chatMessages,
      aiStatuses,
      sendChatMessage,
      broadcastRoomEvent,
    }),
    [
      projectId,
      roomId,
      graphId,
      graphTitle,
      graphScopeKind,
      parentGraphId,
      parentNodeId,
      graphLayer,
      graphLayerKind,
      graphSummary,
      currentUserName,
      status,
      error,
      connectionId,
      nodes,
      edges,
      setCanvasSnapshot,
      presence,
      updatePresence,
      patchPresence,
      chatMessages,
      aiStatuses,
      sendChatMessage,
      broadcastRoomEvent,
    ]
  )

  return (
    <RealtimeRoomContext.Provider value={value}>
      {children}
    </RealtimeRoomContext.Provider>
  )
}

export function useRealtimeRoom() {
  const context = useContext(RealtimeRoomContext)
  if (!context) {
    throw new Error("useRealtimeRoom must be used inside InternalRealtimeProvider")
  }

  return context
}
