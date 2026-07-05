import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { CanvasEdge, CanvasNode } from "@/types/canvas"
import { SHAPE_DEFAULTS } from "@/types/canvas"
import { AiTaskType } from "@/app/generated/prisma/enums"
import { LLM_PROMPT_PACK_TARGET_AGENTS } from "@/lib/prompt-pack/llm-prompt-pack"
import { createCanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { readCanvasDoc, writeCanvasDoc } from "@/lib/canvas/canvas-persistence"
import { applyLlmCanvasImprovementProposal } from "@/lib/canvas/llm-canvas-patch"
import { baseNodeData } from "@/lib/canvas/semantic-defaults"
import { ROOT_GRAPH_ID } from "@/lib/canvas/graph-ids"
import { prisma } from "@/lib/prisma"

interface SourceFile {
  absolutePath: string
  relativePath: string
  content: string
}

interface SourceTerm {
  label: string
  needle: string
  allowLine?: (line: string, file: SourceFile) => boolean
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function pathExists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function repoPath(...segments: string[]) {
  return path.join(process.cwd(), ...segments)
}

function slashPath(filePath: string) {
  return filePath.replace(/\\/g, "/")
}

function term(label: string, parts: string[], allowLine?: SourceTerm["allowLine"]) {
  return {
    label,
    needle: parts.join(""),
    allowLine,
  }
}

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".json"])
const selfPath = slashPath(path.relative(process.cwd(), fileURLToPath(import.meta.url)))
const skippedDirectories = new Set([
  ".git",
  ".next",
  ".local-storage",
  "node_modules",
  "generated",
])

function shouldSkipDirectory(directoryName: string, absolutePath: string) {
  if (skippedDirectories.has(directoryName)) return true
  return slashPath(absolutePath).includes("/app/generated/")
}

async function collectSourceFiles(entries: string[]): Promise<SourceFile[]> {
  const files: SourceFile[] = []

  async function visit(absolutePath: string) {
    if (!(await pathExists(absolutePath))) return
    const statEntries = await readdir(absolutePath, { withFileTypes: true }).catch(
      async () => null
    )

    if (!statEntries) {
      const extension = path.extname(absolutePath)
      const relativePath = slashPath(path.relative(process.cwd(), absolutePath))
      if (sourceExtensions.has(extension) && relativePath !== selfPath) {
        files.push({
          absolutePath,
          relativePath,
          content: await readFile(absolutePath, "utf8"),
        })
      }
      return
    }

    for (const entry of statEntries) {
      const childPath = path.join(absolutePath, entry.name)
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name, childPath)) await visit(childPath)
        continue
      }

      if (!entry.isFile()) continue
      if (entry.name === "package-lock.json") continue
      const extension = path.extname(entry.name)
      const relativePath = slashPath(path.relative(process.cwd(), childPath))
      if (sourceExtensions.has(extension) && relativePath !== selfPath) {
        files.push({
          absolutePath: childPath,
          relativePath,
          content: await readFile(childPath, "utf8"),
        })
      }
    }
  }

  for (const entry of entries) {
    await visit(repoPath(entry))
  }

  return files
}

function assertNoTerms(files: SourceFile[], terms: SourceTerm[], group: string) {
  const failures: string[] = []

  for (const file of files) {
    const lines = file.content.split(/\r?\n/)
    for (const sourceTerm of terms) {
      lines.forEach((line, index) => {
        if (!line.includes(sourceTerm.needle)) return
        if (sourceTerm.allowLine?.(line, file)) return
        failures.push(
          `${file.relativePath}:${index + 1} contains ${sourceTerm.label}`
        )
      })
    }
  }

  assert(failures.length === 0, `${group} failed:\n${failures.join("\n")}`)
}

function assertEveryMatchAllowed(
  files: SourceFile[],
  needle: string,
  label: string,
  allowLine: SourceTerm["allowLine"]
) {
  assertNoTerms(files, [{ label, needle, allowLine }], label)
}

function node(
  id: string,
  label: string,
  data: Partial<CanvasNode["data"]> = {}
): CanvasNode {
  return {
    id,
    type: "canvasNode",
    position: { x: 80, y: 80 },
    selected: true,
    dragging: true,
    data: {
      ...baseNodeData(label),
      ...data,
    },
    width: SHAPE_DEFAULTS.rectangle.width,
    height: SHAPE_DEFAULTS.rectangle.height,
  }
}

function edge(id: string, source: string, target: string): CanvasEdge {
  return {
    id,
    type: "canvasEdge",
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
    selected: true,
    data: {
      semanticType: "contains",
      label: "contains",
      labels: ["contains"],
    },
  }
}

async function assertLegacyAiDesignStaysRemoved(files: SourceFile[]) {
  assert(
    !(await pathExists(repoPath("app", "api", "ai", "design", "route.ts"))),
    "Legacy AI design route returned"
  )
  assert(
    !(await pathExists(repoPath("app", "api", "ai", "design"))),
    "Legacy AI design route directory returned"
  )
  assert(
    !(await pathExists(repoPath("lib", "ai", "design"))),
    "Legacy AI design runtime directory returned"
  )
  const oldDesignTaskType = ["design", "agent"].join("_")
  assert(
    !Object.values(AiTaskType).includes(oldDesignTaskType as AiTaskType),
    "Legacy design task type returned"
  )
  assertNoTerms(
    files,
    [
      term("legacy design route", ["/api/ai/", "design"]),
      term("legacy design task", ["design", "_", "agent"]),
      term("legacy design action provider", ["generate", "Design", "Actions"]),
      term("legacy design runtime path", ["lib/ai/", "design"]),
    ],
    "Legacy AI design generator guardrail"
  )
}

async function assertDeterministicPromptPackStaysRemoved(files: SourceFile[]) {
  assert(
    !(await pathExists(
      repoPath("app", "api", "projects", "[projectId]", "prompt-pack", "route.ts")
    )),
    "Old deterministic project Prompt Pack route returned"
  )
  assert(
    !(await pathExists(repoPath("lib", "prompt-pack", "prompt-pack.ts"))),
    "Old non-LLM prompt compiler module returned"
  )
  assert(
    !(await pathExists(repoPath("lib", "prompt-pack", ["prompt", "pack", "project"].join("-") + ".ts"))),
    "Old non-LLM project prompt module returned"
  )
  assertNoTerms(
    files,
    [
      term("old project prompt compiler", ["compile", "Project", "Prompt", "Pack"]),
      term("old Design IR prompt compiler", [
        "compile",
        "Design",
        "Ir",
        "To",
        "Prompt",
        "Pack",
      ]),
      term("old project prompt module", ["prompt", "-", "pack", "-", "project"]),
    ],
    "Deterministic Prompt Pack generator guardrail"
  )

  const promptPackPanel = await readFile(
    repoPath("components", "editor", "prompt-pack-panel.tsx"),
    "utf8"
  )
  assert(
    promptPackPanel.includes("/api/ai/prompt-pack"),
    "Prompt Pack UI no longer uses the LLM AI task route"
  )
  assert(
    JSON.stringify(LLM_PROMPT_PACK_TARGET_AGENTS) ===
      JSON.stringify(["codex", "claude-code", "generic-ai-builder"]),
    "Prompt Pack target agents changed unexpectedly"
  )
}

async function assertChildLayerPermissionsStayUniversal(files: SourceFile[]) {
  assertNoTerms(
    files,
    [
      term("drill-down-only restriction", ["drill", "-", "down only"]),
      term("service scoped drilldown", ["service", "-", "only"]),
      term("old unavailable design copy", ["Open design", " - ", "coming", " next"]),
      term("node type layer rejection", ["unsupported node type", " for layer"]),
      term("actor layer rejection", ["cannot create layer", " for actor"]),
      term("generic layer rejection", ["cannot create layer", " for generic"]),
      term("node type eligibility rejection", ["node type", " not eligible"]),
      term("drilldown allowlist", ["allowed", "Drilldown", "Types"]),
      term("drilldown allowlist", ["drilldown", "Allowed", "Types"]),
      term("layer eligibility allowlist", ["layer", "Eligible", "Types"]),
      term("type gate", ["can", "Create", "Layer", "For", "Type"]),
      term("service-scoped flag", ["service", "Only"]),
      term("unavailable drilldown copy", ["coming", " next"]),
      term("subcanvas capable allowlist", ["SUBCANVAS", "_", "CAPABLE", "_", "NODE", "_", "TYPES"]),
      term("canHaveSubcanvas metadata gate", ["can", "Have", "Subcanvas"]),
    ],
    "Child-layer universal permission guardrail"
  )

  const subcanvasRoute = await readFile(
    repoPath("app", "api", "projects", "[projectId]", "subcanvas", "route.ts"),
    "utf8"
  )
  assert(
    !subcanvasRoute.includes("semanticType"),
    "Subcanvas route should not gate child layers by semanticType"
  )

  const inspector = await readFile(
    repoPath("components", "editor", "canvas", "semantic-inspector.tsx"),
    "utf8"
  )
  assert(
    inspector.includes("Open design layer") && inspector.includes("Create layer"),
    "Inspector no longer exposes open/create layer actions"
  )
  assert(
    !inspector.includes(["coming", "next"].join(" ")),
    "Inspector contains unavailable drill-down copy"
  )
}

function assertSemanticScanIsAdvisory(files: SourceFile[]) {
  const relevantFiles = files.filter((file) =>
    /semantic|prompt-pack|subcanvas|canvas-patch/i.test(file.relativePath)
  )
  assertNoTerms(
    relevantFiles,
    [
      term("Prompt Pack completeness block", ["block", " Prompt Pack"]),
      term("child layer completeness block", ["block", " child-layer"]),
      term("drill-down completeness block", ["block", " drill-down"]),
      term("semantic gatekeeper copy", ["Semantic Scan blocks"]),
      term("metadata completeness gate", ["metadata incomplete", " block"]),
    ],
    "Semantic Scan advisory guardrail"
  )

  const semanticValidation = relevantFiles.find(
    (file) => file.relativePath === "lib/canvas/semantic-validation.ts"
  )
  assert(semanticValidation, "semantic validation source missing")
  assert(
    semanticValidation.content.includes("advisory:") &&
      semanticValidation.content.includes("blocking:") &&
      semanticValidation.content.includes("SemanticValidationCategory"),
    "Semantic validation no longer exposes advisory/blocking categorized findings"
  )
}

async function assertArchitectLlmFirst(files: SourceFile[]) {
  assert(await pathExists(repoPath("app", "api", "ai", "architect", "route.ts")), "Architect route missing")
  assert(
    Object.values(AiTaskType).includes("architect_conversation"),
    "Architect conversation task type missing"
  )

  const providerTypes = await readFile(
    repoPath("lib", "ai", "providers", "types.ts"),
    "utf8"
  )
  assert(
    providerTypes.includes("generateArchitectReply"),
    "AI provider contract lacks Architect reply method"
  )

  const architectHandler = await readFile(
    repoPath("lib", "ai-tasks", "task-handlers", "architect-conversation-handler.ts"),
    "utf8"
  )
  assert(
    architectHandler.includes("loadProjectCanvasPyramid") &&
      architectHandler.includes("currentGraphId") &&
      architectHandler.includes("selectedNodeIds") &&
      architectHandler.includes("getRecentArchitectMessagesForProvider"),
    "Architect task no longer sends canvas pyramid, current graph, selected nodes, and project messages"
  )

  assertNoTerms(
    files,
    [
      term("deterministic architecture judge", ["architecture judge"]),
      term("quality judge", ["quality judge"]),
      term("judge architecture", ["judge architecture"]),
    ],
    "Architect LLM-first guardrail"
  )
}

function assertNoBloatRegression(files: SourceFile[]) {
  const excludedTargetUpper = ["Nim", "bus"].join("")
  const excludedTargetLower = excludedTargetUpper.toLowerCase()
  const allowsExcludedTarget = (line: string, file: SourceFile) => {
    const lowerLine = line.toLowerCase()
    return (
      file.relativePath.endsWith("-smoke.ts") ||
      lowerLine.includes("not include") ||
      lowerLine.includes("not included") ||
      lowerLine.includes("not a prompt pack target") ||
      lowerLine.includes(`mentioned ${excludedTargetLower}`) ||
      lowerLine.includes("active prompt pack target")
    )
  }

  assertEveryMatchAllowed(
    files,
    excludedTargetUpper,
    "excluded target behavior",
    allowsExcludedTarget
  )
  assertEveryMatchAllowed(
    files,
    excludedTargetLower,
    "excluded target behavior",
    allowsExcludedTarget
  )
  assertNoTerms(
    files,
    [
      term("legacy hosted auth dependency", ["@", "clerk"]),
      term("legacy realtime dependency", ["@", "liveblocks"]),
      term("legacy task dependency", ["@", "trigger.dev"]),
      term("retired persona behavior", ["Gh", "ost", " AI"]),
      term("full notation palette", ["full U", "ML"]),
      term("process grammar", ["B", "PMN grammar"]),
      term("enterprise notation clone", ["Archi", "Mate clone"]),
      term("provider mega palette", ["cloud", " vendor mega"]),
      term("image ingest behavior", ["image", " upload"]),
      term("multi-signal model input", ["multi", "modal"]),
      term("visual model input", ["vis", "ion input"]),
      term("image model input", ["image", "-to-", "LLM"]),
      term("screenshot ingest behavior", ["screenshot", " upload"]),
      term("generated-code execution", ["execute generated", " code"]),
      term("generated-app execution", ["run generated", " app"]),
      term("repository write-back", ["repo", " write"]),
      term("repository write behavior", ["write", " to repo"]),
      term("generated deploy behavior", ["deploy", " generated"]),
    ],
    "Canvas v2 anti-bloat guardrail"
  )
}

async function assertGenericAndActorLayersCanApply() {
  const root = await mkdtemp(path.join(os.tmpdir(), "arc-forge-canvas-v2-guardrails-"))
  process.env.STORAGE_PROVIDER = "local_fs"
  process.env.LOCAL_STORAGE_ROOT = root

  const projectId = "project-canvas-v2-guardrails-smoke"
  const userId = "user-canvas-v2-guardrails-smoke"
  const genericNode = node("generic-capability", "Generic Capability", {
    semanticType: "unclassified",
    architectureType: "custom-business-capability",
    llmSemanticType: "generic-capability",
  })
  const actorNode = node("actor-customer", "Customer Actor", {
    semanticType: "unclassified",
    architectureType: "actor",
    llmSemanticType: "actor",
    description: "Represents a customer persona and touchpoints.",
  })
  const rootDoc = createCanvasDocV1(
    {
      nodes: [genericNode, actorNode],
      edges: [edge("edge-actor-generic", actorNode.id, genericNode.id)],
    },
    {
      projectId,
      graphId: ROOT_GRAPH_ID,
      scopeKind: "system-root",
      title: "Canvas v2 Guardrails Smoke",
    }
  )

  try {
    await prisma.project.deleteMany({ where: { id: projectId } })
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.user.create({
      data: {
        id: userId,
        email: "canvas-v2-guardrails-smoke@example.test",
        name: "Canvas v2 Guardrails Smoke",
      },
    })
    await prisma.project.create({
      data: {
        id: projectId,
        ownerId: userId,
        name: "Canvas v2 Guardrails Smoke",
      },
    })
    await writeCanvasDoc(projectId, rootDoc, {
      graphId: ROOT_GRAPH_ID,
      scopeKind: "system-root",
      title: "Canvas v2 Guardrails Smoke",
    })

    const applyResult = await applyLlmCanvasImprovementProposal({
      projectId,
      currentGraphId: ROOT_GRAPH_ID,
      proposal: {
        summary: "Create child layers for generic and actor-like nodes.",
        operations: [
          {
            op: "create-layer",
            parentGraphId: ROOT_GRAPH_ID,
            parentNodeId: genericNode.id,
            graph: {
              title: "Generic Capability Internals",
              layerKind: "custom-capability-layer",
              summary: "LLM-chosen internals for a generic/custom node.",
              nodes: [
                {
                  id: "generic-decision",
                  label: "Capability Decision",
                  semanticType: "business-rule",
                  description: "Captures the decision flow inside the capability.",
                },
                {
                  id: "generic-policy",
                  label: "Capability Policy",
                  semanticType: "policy",
                  description: "Guards capability execution.",
                },
              ],
              edges: [
                {
                  id: "edge-generic-decision-policy",
                  source: "generic-decision",
                  target: "generic-policy",
                  semanticType: "guards",
                  label: "guards",
                  metadata: {},
                },
              ],
            },
          },
          {
            op: "create-layer",
            parentGraphId: ROOT_GRAPH_ID,
            parentNodeId: actorNode.id,
            graph: {
              title: "Customer Actor Journey",
              layerKind: "actor-journey-layer",
              summary: "Actor-specific touchpoints and permission notes.",
              nodes: [
                {
                  id: "actor-touchpoint",
                  label: "Customer Touchpoint",
                  semanticType: "endpoint",
                  description: "Where the customer enters the product flow.",
                },
                {
                  id: "actor-permission",
                  label: "Customer Permission",
                  semanticType: "policy",
                  description: "What the actor is allowed to do.",
                },
              ],
              edges: [
                {
                  id: "edge-actor-touchpoint-permission",
                  source: "actor-touchpoint",
                  target: "actor-permission",
                  semanticType: "guards",
                  label: "checks permission",
                  metadata: {},
                },
              ],
            },
          },
        ],
      },
    })

    assert(applyResult.applied.createLayers === 2, "Both child layers should apply")
    assert(applyResult.applied.skippedOperations === 0, "Child layers should not be skipped")

    const writtenRoot = await readCanvasDoc(projectId, ROOT_GRAPH_ID)
    assert(writtenRoot, "Root CanvasDoc missing after child layer apply")
    const genericWithLayer = writtenRoot.nodes.find((item) => item.id === genericNode.id)
    const actorWithLayer = writtenRoot.nodes.find((item) => item.id === actorNode.id)
    const genericGraphId = genericWithLayer?.data.subcanvasRef?.graphId
    const actorGraphId = actorWithLayer?.data.subcanvasRef?.graphId
    assert(genericGraphId, "Generic node did not receive subcanvasRef")
    assert(actorGraphId, "Actor-like node did not receive subcanvasRef")

    const genericChild = await readCanvasDoc(projectId, genericGraphId)
    const actorChild = await readCanvasDoc(projectId, actorGraphId)
    assert(genericChild, "Generic child graph missing")
    assert(actorChild, "Actor-like child graph missing")
    assert(
      genericChild.nodes.some((item) => item.id === "generic-decision") &&
        genericChild.edges.some((item) => item.id === "edge-generic-decision-policy"),
      "Generic child graph did not receive starter internals"
    )
    assert(
      actorChild.nodes.some((item) => item.id === "actor-touchpoint") &&
        actorChild.edges.some((item) => item.id === "edge-actor-touchpoint-permission"),
      "Actor-like child graph did not receive starter internals"
    )
  } finally {
    await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => {})
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {})
    await rm(root, { recursive: true, force: true }).catch(() => {})
  }
}

async function main() {
  const files = await collectSourceFiles([
    "app",
    "components",
    "hooks",
    "lib",
    "scripts",
    "types",
    "package.json",
  ])

  await assertLegacyAiDesignStaysRemoved(files)
  await assertDeterministicPromptPackStaysRemoved(files)
  await assertChildLayerPermissionsStayUniversal(files)
  assertSemanticScanIsAdvisory(files)
  await assertArchitectLlmFirst(files)
  assertNoBloatRegression(files)
  await assertGenericAndActorLayersCanApply()

  await prisma.$disconnect()
  console.log("canvas v2 guardrails smoke passed")
}

main().catch(async (error: unknown) => {
  console.error(error)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
