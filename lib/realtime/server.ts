import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import { URL } from "node:url"
import { z } from "zod"
import { Prisma } from "@/app/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import {
  RuntimeConfigError,
  getAllowedAppOrigins,
  getAppEnv,
  isLocalAppEnv,
} from "@/lib/config/runtime-env"
import { getInternalRealtimeServiceSecret } from "@/lib/realtime/internal-realtime-url"
import {
  MAX_REALTIME_PAYLOAD_BYTES,
  parseRealtimeClientMessage,
  serializeRealtimeServerMessage,
} from "@/lib/realtime/protocol"
import { RealtimeRoomRegistry } from "@/lib/realtime/room-state"
import {
  RealtimeTokenError,
  verifyRealtimeRoomToken,
} from "@/lib/realtime/token"
import type { JsonValue } from "@/lib/realtime/types"
import { verifyRealtimeTokenProjectAccess } from "@/lib/realtime/access"
import { WebSocketServer, type RawData, type WebSocket } from "ws"

const DEFAULT_REALTIME_PORT = 3001
const INTERNAL_PUBLISH_USER_ID = "arc-forge-ai"

interface PersistRealtimeEventInput {
  projectId: string
  roomId: string
  userId: string | null
}

const InternalBroadcastSchema = z.object({
  projectId: z.string().trim().min(1).max(100),
  roomId: z.string().trim().min(1).max(240),
  userId: z.string().trim().min(1).max(120).optional().nullable(),
  event: z.object({
    type: z.string().trim().min(1).max(120),
    payload: z.unknown(),
  }),
})

export interface RealtimeServerOptions {
  port?: number
  hostname?: string
}

export interface RunningRealtimeServer {
  server: Server
  close: () => Promise<void>
}

function toInputJson(value: JsonValue): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function writeHttpJson(
  response: ServerResponse,
  status: number,
  body: Record<string, string | number | boolean>
) {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(body))
}

function readRequestBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = ""
    request.setEncoding("utf8")
    request.on("data", (chunk: string) => {
      body += chunk
      if (Buffer.byteLength(body, "utf8") > MAX_REALTIME_PAYLOAD_BYTES) {
        reject(new Error("Request body is too large"))
        request.destroy()
      }
    })
    request.on("end", () => resolve(body))
    request.on("error", reject)
  })
}

function rejectUpgrade(
  request: IncomingMessage,
  status: 400 | 401 | 403 | 404,
  message: string
) {
  request.socket.write(
    `HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`
  )
  request.socket.destroy()
}

function rawDataToString(data: RawData) {
  if (typeof data === "string") return data
  if (Buffer.isBuffer(data)) return data.toString("utf8")
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8")
  return Buffer.from(new Uint8Array(data)).toString("utf8")
}

async function authorizeUpgrade(request: IncomingMessage) {
  const url = new URL(request.url ?? "/", "http://localhost")

  if (url.pathname !== "/ws") {
    throw new RealtimeTokenError("Unknown realtime endpoint")
  }

  validateBrowserUpgrade(request)

  const token = url.searchParams.get("token")

  if (!token) {
    throw new RealtimeTokenError("Missing realtime token")
  }

  const payload = verifyRealtimeRoomToken(token)
  const hasAccess = await verifyRealtimeTokenProjectAccess(payload)

  if (!hasAccess) {
    throw new RealtimeTokenError("Realtime access was revoked")
  }

  return payload
}

function getForwardedProtocol(request: IncomingMessage) {
  const header = request.headers["x-forwarded-proto"]
  const value = Array.isArray(header) ? header[0] : header
  return value?.split(",")[0]?.trim().toLowerCase() ?? null
}

function validateBrowserUpgrade(request: IncomingMessage) {
  if (isLocalAppEnv()) return

  const forwardedProto = getForwardedProtocol(request)
  if (forwardedProto !== "https") {
    throw new RealtimeTokenError("Secure WebSocket transport is required")
  }

  const origin = request.headers.origin
  if (!origin) {
    throw new RealtimeTokenError("Origin is required")
  }

  const originUrl = new URL(origin)
  if (originUrl.protocol !== "https:") {
    throw new RealtimeTokenError("Secure Origin is required")
  }

  const allowedOrigins = getAllowedAppOrigins()
  if (!allowedOrigins.has(originUrl.origin)) {
    throw new RealtimeTokenError("Origin is not allowed")
  }
}

async function persistRealtimeEvent(
  connection: PersistRealtimeEventInput,
  eventType: string,
  payload: JsonValue
) {
  await prisma.realtimeRoomEvent.create({
    data: {
      projectId: connection.projectId,
      roomId: connection.roomId,
      userId: connection.userId,
      type: eventType,
      payloadJson: toInputJson(payload),
    },
  })
}

export function createRealtimeServer(options: RealtimeServerOptions = {}) {
  const port = options.port ?? DEFAULT_REALTIME_PORT
  const registry = new RealtimeRoomRegistry()
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_REALTIME_PAYLOAD_BYTES,
  })
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost")

    if (request.method === "GET" && url.pathname === "/health") {
      writeHttpJson(response, 200, {
        status: "ok",
        service: "internal-realtime",
        uptimeSeconds: Math.floor(process.uptime()),
      })
      return
    }

    if (request.method === "POST" && url.pathname === "/internal/broadcast") {
      handleInternalBroadcast(request, response, registry).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Invalid request"
        writeHttpJson(response, 400, { error: message })
      })
      return
    }

    writeHttpJson(response, 404, { error: "Not found" })
  })

  server.on("upgrade", (request, socket, head) => {
    authorizeUpgrade(request)
      .then((payload) => {
        webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
          const connection = registry.join(webSocket, payload)

          console.info("[realtime] Client joined room", {
            roomId: payload.roomId,
            projectId: payload.projectId,
            userId: payload.userId,
          })

          webSocket.on("message", (rawData) => {
            const parsed = parseRealtimeClientMessage(rawDataToString(rawData))

            if (!parsed.ok) {
              registry.sendError(connection, parsed.error, "invalid_message")
              return
            }

            if (parsed.message.type === "presence.update") {
              registry.updatePresence(connection, parsed.message.presence)
              return
            }

            if (parsed.message.type === "room.ping") {
              registry.pong(connection, parsed.message.requestId)
              return
            }

            const roomEvent = parsed.message.event

            persistRealtimeEvent(payload, roomEvent.type, roomEvent.payload).catch((error: unknown) => {
              const message =
                error instanceof Error ? error.message : "Unknown error"
              console.warn("[realtime] Failed to persist room event", {
                roomId: payload.roomId,
                eventType: roomEvent.type,
                message,
              })
            })

            registry.broadcastEvent(connection, roomEvent)
          })

          webSocket.on("close", () => {
            registry.leave(connection)
            console.info("[realtime] Client left room", {
              roomId: payload.roomId,
              userId: payload.userId,
            })
          })

          webSocket.on("error", (error: Error) => {
            console.warn("[realtime] WebSocket error", {
              roomId: payload.roomId,
              userId: payload.userId,
              message: error.message,
            })
          })
        })
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Invalid realtime token"
        const status = message.includes("revoked") ? 403 : 401
        rejectUpgrade(request, status, status === 403 ? "Forbidden" : "Unauthorized")
      })
  })

  return {
    listen() {
      return new Promise<RunningRealtimeServer>((resolve) => {
        server.listen(port, options.hostname, () => {
          console.info("[realtime] Server started", { port })
          resolve({
            server,
            close: () =>
              new Promise<void>((closeResolve, closeReject) => {
                webSocketServer.clients.forEach((client: WebSocket) => {
                  client.send(
                    serializeRealtimeServerMessage({
                      type: "error",
                      message: "Realtime server is shutting down",
                      code: "server_shutdown",
                    })
                  )
                  client.close()
                })

                webSocketServer.close((webSocketError) => {
                  if (webSocketError) {
                    closeReject(webSocketError)
                    return
                  }

                  server.close((serverError) => {
                    if (serverError) {
                      closeReject(serverError)
                      return
                    }

                    closeResolve()
                  })
                })
              }),
          })
        })
      })
    },
  }
}

async function handleInternalBroadcast(
  request: IncomingMessage,
  response: ServerResponse,
  registry: RealtimeRoomRegistry
) {
  const providedSecret = request.headers["x-internal-realtime-secret"]
  const secret = Array.isArray(providedSecret) ? providedSecret[0] : providedSecret

  if (!secret || secret !== getInternalRealtimeServiceSecret()) {
    writeHttpJson(response, 401, { error: "Unauthorized" })
    return
  }

  const rawBody = await readRequestBody(request)
  const parsedBody = InternalBroadcastSchema.safeParse(JSON.parse(rawBody || "{}"))
  if (!parsedBody.success) {
    writeHttpJson(response, 400, { error: "Invalid broadcast payload" })
    return
  }

  const payload = parsedBody.data
  const eventPayload = JSON.parse(JSON.stringify(payload.event.payload)) as JsonValue

  await persistRealtimeEvent(
    {
      userId: null,
      projectId: payload.projectId,
      roomId: payload.roomId,
    },
    payload.event.type,
    eventPayload
  )

  registry.broadcastInternal({
    projectId: payload.projectId,
    roomId: payload.roomId,
    userId: payload.userId ?? INTERNAL_PUBLISH_USER_ID,
    event: {
      type: payload.event.type,
      payload: eventPayload,
    },
  })

  writeHttpJson(response, 200, { ok: true })
}

if (!isLocalAppEnv() && !process.env.APP_URL?.trim()) {
  throw new RuntimeConfigError(`APP_URL must be set for APP_ENV=${getAppEnv()}`)
}
