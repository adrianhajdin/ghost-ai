import type { NextRequest } from "next/server"

import { getCurrentProjectIdentity, userHasProjectAccess } from "@/lib/project-access"
import { compileProjectPromptPack } from "@/lib/prompt-pack/prompt-pack-project"
import {
  isPromptPackMode,
  isPromptPackTargetAgent,
  type PromptPackMode,
  type PromptPackTargetAgent,
} from "@/lib/prompt-pack/prompt-pack"

type BooleanParseResult = boolean | "invalid"
type PromptPackFormat = "json" | "markdown"

function parseBooleanParam(
  value: string | null,
  fallback: boolean
): BooleanParseResult {
  if (value === null) return fallback
  if (["1", "true", "yes"].includes(value.toLowerCase())) return true
  if (["0", "false", "no"].includes(value.toLowerCase())) return false
  return "invalid"
}

function invalidQuery(message: string) {
  return Response.json({ error: message }, { status: 400 })
}

function parseTargetAgent(value: string | null): PromptPackTargetAgent | "invalid" {
  if (value === null) return "codex"
  return isPromptPackTargetAgent(value) ? value : "invalid"
}

function parseMode(value: string | null): PromptPackMode | "invalid" {
  if (value === null) return "implementation-plan"
  return isPromptPackMode(value) ? value : "invalid"
}

function parseFormat(value: string | null): PromptPackFormat | "invalid" {
  if (value === null) return "json"
  return value === "json" || value === "markdown" ? value : "invalid"
}

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[projectId]/prompt-pack">
) {
  const identity = await getCurrentProjectIdentity(request)
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { projectId } = await ctx.params
  const hasAccess = await userHasProjectAccess(projectId, identity)
  if (!hasAccess) return Response.json({ error: "Not found" }, { status: 404 })

  const params = request.nextUrl.searchParams
  const targetAgent = parseTargetAgent(params.get("targetAgent"))
  const mode = parseMode(params.get("mode"))
  const format = parseFormat(params.get("format"))
  const includeValidation = parseBooleanParam(params.get("includeValidation"), true)
  const rootOnly = parseBooleanParam(params.get("rootOnly"), false)
  const download = parseBooleanParam(params.get("download"), false)

  if (targetAgent === "invalid") return invalidQuery("Invalid targetAgent")
  if (mode === "invalid") return invalidQuery("Invalid mode")
  if (format === "invalid") return invalidQuery("Invalid format")
  if (includeValidation === "invalid") return invalidQuery("Invalid includeValidation")
  if (rootOnly === "invalid") return invalidQuery("Invalid rootOnly")
  if (download === "invalid") return invalidQuery("Invalid download")

  const result = await compileProjectPromptPack(projectId, {
    targetAgent,
    mode,
    includeValidation,
    rootOnly,
  })

  if (format === "markdown") {
    return new Response(result.markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        ...(download
          ? {
              "Content-Disposition": `attachment; filename="prompt-pack-${targetAgent}-${projectId}.md"`,
            }
          : {}),
      },
    })
  }

  const payload = {
    promptPack: result.promptPack,
    markdown: result.markdown,
    status: result.status,
    targetAgent: result.targetAgent,
    irHash: result.irHash,
    warnings: result.warnings,
  }

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(download
        ? {
            "Content-Disposition": `attachment; filename="prompt-pack-${targetAgent}-${projectId}.json"`,
          }
        : {}),
    },
  })
}
