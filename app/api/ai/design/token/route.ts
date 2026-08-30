import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { auth as triggerAuth } from "@trigger.dev/sdk"

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body: unknown = await request.json().catch(() => ({}))
  const b = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {}
  const runId = typeof b.runId === "string" ? b.runId.trim() : ""

  if (!runId) return Response.json({ error: "Missing runId" }, { status: 400 })

  const taskRun = await prisma.taskRun.findUnique({ where: { runId } })
  if (!taskRun || taskRun.userId !== userId) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  const token = await triggerAuth.createPublicToken({
    scopes: { read: { runs: [runId] } },
    expirationTime: "1h",
  })

  return Response.json({ token })
}
