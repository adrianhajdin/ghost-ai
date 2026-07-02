import { createHash } from "node:crypto"

import type {
  DesignIrDecision,
  DesignIrNode,
  DesignIrRelation,
  DesignIrValidationResult,
  DesignIrV1,
} from "@/lib/canvas/design-ir"
import {
  isSecretReference,
  looksLikeRawSecretValue,
  shouldStripSecretField,
} from "@/lib/canvas/secret-guards"

export const PROMPT_PACK_VERSION = "1.0.0" as const
export const PROMPT_PACK_SCHEMA_URL =
  "https://arcforge.dev/schemas/prompt-pack.v1.json" as const

export const PROMPT_PACK_TARGET_AGENTS = [
  "codex",
  "claude-code",
  "generic-ai-builder",
] as const

export type PromptPackTargetAgent = (typeof PROMPT_PACK_TARGET_AGENTS)[number]
export type PromptPackMode = "implementation-plan"
export type PromptPackStatus = "ready" | "has-warnings" | "draft"

export interface PromptPackCompileOptions {
  targetAgent?: PromptPackTargetAgent
  mode?: PromptPackMode
}

export interface PromptPackWarning {
  id: string
  severity: "warning" | "error"
  targetKind: "node" | "edge" | "canvas" | "prompt-pack"
  targetId?: string
  sourceGraphId?: string
  field?: string
  message: string
}

export interface PromptPackSummaryItem {
  id: string
  name: string
  semanticType: string
  sourceGraphId: string
  description?: string
  parentServiceId?: string
  parentServiceName?: string
  details: string[]
}

export interface PromptPackRelationSummary {
  id: string
  source: string
  target: string
  semanticType: string
  label: string
  labels: string[]
  sourceGraphId: string
}

export interface PromptPackArchitectureSummary {
  overview: string
  graphHierarchy: string[]
  services: PromptPackSummaryItem[]
  endpoints: PromptPackSummaryItem[]
  dataModels: PromptPackSummaryItem[]
  workers: PromptPackSummaryItem[]
  events: PromptPackSummaryItem[]
  policies: PromptPackSummaryItem[]
  businessRules: PromptPackSummaryItem[]
  validationRules: PromptPackSummaryItem[]
  frontends: PromptPackSummaryItem[]
  externalSystems: PromptPackSummaryItem[]
  notes: PromptPackSummaryItem[]
  unclassifiedItems: PromptPackSummaryItem[]
  relations: PromptPackRelationSummary[]
}

export interface PromptPackInstructions {
  role: string
  mission: string[]
  targetGuidance: string[]
  forbiddenChoices: string[]
  implementationPlan: string[]
  acceptanceChecklist: string[]
  validationTestingChecklist: string[]
  finalReportRequirements: string[]
}

export interface PromptPackV1 {
  $schema: typeof PROMPT_PACK_SCHEMA_URL
  packVersion: typeof PROMPT_PACK_VERSION
  targetAgent: PromptPackTargetAgent
  targetLabel: string
  mode: PromptPackMode
  status: PromptPackStatus
  project: DesignIrV1["project"]
  source: {
    irVersion: DesignIrV1["irVersion"]
    irHash: string
    compiledGraphIds: string[]
    graphCount: number
    validationStatus: DesignIrV1["validationSummary"]["status"]
  }
  architectureSummary: PromptPackArchitectureSummary
  instructions: PromptPackInstructions
  warnings: PromptPackWarning[]
  assumptions: string[]
  decisions: DesignIrDecision[]
  sourceRefs: string[]
  output: {
    markdown: string
  }
  provenance: {
    compiler: "arc-forge-prompt-pack"
    compilerVersion: typeof PROMPT_PACK_VERSION
    source: "Design IR v1"
    deterministic: true
    aiGenerated: false
    persistedByDefault: false
    executedByArcForge: false
  }
}

interface TargetConfig {
  label: string
  role: string
  targetGuidance: string[]
  implementationPlan: string[]
  finalReportRequirements: string[]
}

const TARGET_CONFIG: Record<PromptPackTargetAgent, TargetConfig> = {
  codex: {
    label: "Codex",
    role: "ROLE: You are Codex working in a software repository.",
    targetGuidance: [
      "Inspect the repository before changing files; do not assume the file structure or framework conventions.",
      "Create a feature branch unless the repository owner explicitly instructs you to continue on an existing branch.",
      "Implement incrementally, keep changes scoped to the architecture described by this Prompt Pack, and preserve existing tests.",
      "Run the repository validation commands that apply to the changed surface before reporting completion.",
      "Open or report the pull request according to the repository workflow.",
      "Do not use raw secrets.",
      "Do not ignore architecture rules from Design IR.",
      "If the repo conflicts with this prompt, stop and report.",
    ],
    implementationPlan: [
      "Inspect the project README, package scripts, framework config, schema files, and existing feature boundaries.",
      "Map the Design IR services, data models, endpoints, workers, policies, rules, and relations to the existing repository structure.",
      "Create or update the smallest set of files needed to implement the requested architecture.",
      "Keep authentication, authorization, tenant, owner, and project boundaries aligned with the Design IR.",
      "Add or update focused tests for the implemented behavior.",
      "Run lint, build, and relevant unit/integration/smoke commands.",
      "Prepare a final report with branch, commit, tests, risks, and changed files.",
    ],
    finalReportRequirements: [
      "Branch name and commit SHA.",
      "Files changed and a concise implementation summary.",
      "Validation commands run with pass/fail results.",
      "Known risks, assumptions, and any repository conflicts.",
      "Pull request URL or clear handoff instructions.",
    ],
  },
  "claude-code": {
    label: "Claude Code",
    role: "ROLE: You are Claude Code working as a senior implementation agent.",
    targetGuidance: [
      "Inspect the repository before changing files; do not assume the file structure or framework conventions.",
      "Share a short visible plan before implementation.",
      "Implement carefully with minimal, well-scoped changes.",
      "Run the relevant tests and summarize decisions, risks, and validation.",
      "Use concise visible reasoning summaries only.",
      "Do not use raw secrets.",
      "Do not ignore architecture rules from Design IR.",
      "If the repo conflicts with this prompt, stop and report.",
    ],
    implementationPlan: [
      "Read the existing architecture, scripts, schemas, and surrounding implementation patterns.",
      "State a brief plan that connects repository surfaces to the Design IR sections.",
      "Implement the feature in small steps while preserving current behavior outside the requested scope.",
      "Protect auth, tenant, owner, and project boundaries described by the Design IR.",
      "Add or update focused tests and run the validation commands that fit the changed surface.",
      "Summarize decisions, risks, and any mismatches between the repo and this Prompt Pack.",
    ],
    finalReportRequirements: [
      "Implementation summary.",
      "Files changed.",
      "Tests and validation results.",
      "Architecture decisions and risks.",
      "Any blocked or conflicting requirements.",
    ],
  },
  "generic-ai-builder": {
    label: "Generic AI Builder",
    role: "ROLE: You are an AI app builder.",
    targetGuidance: [
      "Use this Prompt Pack as a self-contained implementation brief.",
      "Build the product goal, architecture, UI, backend, data, API, auth, security, and validation behavior described here.",
      "Do not assume Git, GitHub, branches, or pull requests are available.",
      "Do not use raw secrets.",
      "Do not ignore architecture rules from Design IR.",
      "If the available builder platform conflicts with this prompt, stop and report.",
    ],
    implementationPlan: [
      "Create the application structure required by the product goal and architecture summary.",
      "Implement frontend surfaces, backend/data/API behavior, auth/security controls, and validation rules from the Design IR.",
      "Wire dependencies and relations without replacing the architecture with unrelated platform shortcuts.",
      "Add practical checks or tests supported by the builder environment.",
      "Provide a final handoff that explains what was built, what was validated, and what remains incomplete.",
    ],
    finalReportRequirements: [
      "What was built.",
      "Architecture sections covered.",
      "Validation or manual checks completed.",
      "Known gaps, assumptions, and unsupported platform constraints.",
    ],
  },
}

const COMMON_FORBIDDEN_CHOICES = [
  "Do not hardcode secrets.",
  "Do not send secrets to the browser or client runtime.",
  "Do not skip authentication or authorization when the Design IR includes auth boundaries.",
  "Do not ignore tenant, owner, or project boundaries.",
  "Do not replace the architecture with unrelated SaaS shortcuts.",
  "Do not drop unclassified items; keep them visible until resolved.",
  "Do not invent providers or credentials.",
  "Do not implement unsupported integrations.",
  "Do not claim completion without tests or explicit validation.",
]

const REPO_FORBIDDEN_CHOICES = [
  "Do not commit generated local artifacts.",
  "Do not remove tests without explanation.",
  "Do not bypass lint, build, or test failures.",
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, "en")
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isRecord(value)) return value

  const output: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort(compareText)) {
    const child = stableValue(value[key])
    if (child !== undefined) output[key] = child
  }
  return output
}

function stableStringify(value: unknown) {
  return JSON.stringify(stableValue(value))
}

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))].sort(
    compareText
  )
}

function sanitizeText(value: string): string {
  if (!value.trim()) return ""
  if (isSecretReference(value)) return value.trim()
  if (looksLikeRawSecretValue(value)) return "[redacted-secret]"
  return value.trim()
}

function sanitizeStringArray(values: string[]) {
  return uniqueSorted(values.map(sanitizeText))
}

function detailValue(key: string, value: unknown): string | null {
  if (shouldStripSecretField(key, value)) return `${key}: [redacted-secret]`
  if (typeof value === "string") {
    const clean = sanitizeText(value)
    return clean ? `${key}: ${clean}` : null
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return `${key}: ${String(value)}`
  }
  if (Array.isArray(value)) {
    const text = sanitizeStringArray(
      value.flatMap((item) => (typeof item === "string" ? [item] : [JSON.stringify(stableValue(item))]))
    ).join(", ")
    return text ? `${key}: ${text}` : null
  }
  if (isRecord(value)) {
    const text = JSON.stringify(stableValue(value))
    if (looksLikeRawSecretValue(text)) return `${key}: [redacted-secret]`
    return `${key}: ${text}`
  }
  return null
}

function nodeDetails(node: DesignIrNode): string[] {
  const details: string[] = []

  for (const key of Object.keys(node.metadata).sort(compareText)) {
    const detail = detailValue(key, node.metadata[key])
    if (detail) details.push(detail)
  }

  if (node.status) details.push(`status: ${sanitizeText(node.status)}`)
  if (node.tags.length > 0) details.push(`tags: ${sanitizeStringArray(node.tags).join(", ")}`)
  return details
}

function summarizeNode(node: DesignIrNode): PromptPackSummaryItem {
  const item: PromptPackSummaryItem = {
    id: sanitizeText(node.id),
    name: sanitizeText(node.name),
    semanticType: sanitizeText(node.semanticType),
    sourceGraphId: sanitizeText(node.sourceGraphId),
    details: nodeDetails(node),
  }

  const description = sanitizeText(node.description)
  if (description) item.description = description
  if (node.parentServiceId) item.parentServiceId = sanitizeText(node.parentServiceId)
  if (node.parentServiceName) item.parentServiceName = sanitizeText(node.parentServiceName)
  return item
}

function summarizeRelations(relations: DesignIrRelation[]): PromptPackRelationSummary[] {
  return relations.map((relation) => ({
    id: sanitizeText(relation.id),
    source: sanitizeText(relation.source),
    target: sanitizeText(relation.target),
    semanticType: sanitizeText(relation.semanticType),
    label: sanitizeText(relation.label),
    labels: sanitizeStringArray(relation.labels),
    sourceGraphId: sanitizeText(relation.sourceGraphId),
  }))
}

function summarizeGraphHierarchy(ir: DesignIrV1): string[] {
  if (ir.graphs.length === 0) return ["No canvas graphs are available yet."]

  return ir.graphs.map((graph) => {
    const parent = graph.parentServiceName
      ? ` under ${sanitizeText(graph.parentServiceName)}`
      : graph.parentNodeId
      ? ` under parent node ${sanitizeText(graph.parentNodeId)}`
      : ""
    return `${sanitizeText(graph.graphId)} (${sanitizeText(graph.scopeKind)}): ${sanitizeText(
      graph.title
    )}${parent}; ${graph.nodeCount} nodes, ${graph.edgeCount} edges.`
  })
}

export function summarizeDesignIrForPromptPack(
  ir: DesignIrV1
): PromptPackArchitectureSummary {
  const relationText =
    ir.relations.length === 1 ? "1 relation" : `${ir.relations.length} relations`
  const warningCount = ir.validationSummary.warnings + ir.validationSummary.errors
  const warningText =
    warningCount === 0
      ? "no actionable warnings"
      : `${ir.validationSummary.warnings} warnings and ${ir.validationSummary.errors} errors`

  return {
    overview: `${sanitizeText(ir.project.name)} contains ${ir.graphs.length} graph(s), ${ir.services.length} service(s), ${ir.endpoints.length} endpoint(s), ${ir.dataModels.length} data model(s), and ${relationText}. Design IR status is ${ir.validationSummary.status} with ${warningText}.`,
    graphHierarchy: summarizeGraphHierarchy(ir),
    services: ir.services.map(summarizeNode),
    endpoints: ir.endpoints.map(summarizeNode),
    dataModels: ir.dataModels.map(summarizeNode),
    workers: ir.workers.map(summarizeNode),
    events: ir.events.map(summarizeNode),
    policies: ir.policies.map(summarizeNode),
    businessRules: ir.businessRules.map(summarizeNode),
    validationRules: ir.validationRules.map(summarizeNode),
    frontends: ir.frontends.map(summarizeNode),
    externalSystems: ir.externalSystems.map(summarizeNode),
    notes: ir.notes.map(summarizeNode),
    unclassifiedItems: ir.unclassifiedNodes.map(summarizeNode),
    relations: summarizeRelations(ir.relations),
  }
}

export function stableHashDesignIr(ir: DesignIrV1): string {
  return createHash("sha256").update(stableStringify(ir)).digest("hex")
}

export function isPromptPackTargetAgent(
  value: string | null | undefined
): value is PromptPackTargetAgent {
  return PROMPT_PACK_TARGET_AGENTS.includes(value as PromptPackTargetAgent)
}

export function isPromptPackMode(value: string | null | undefined): value is PromptPackMode {
  return value === "implementation-plan"
}

function promptStatus(ir: DesignIrV1): PromptPackStatus {
  if (
    ir.validationSummary.status === "draft" ||
    ir.unclassifiedNodes.length > 0 ||
    ir.relations.some((relation) => relation.semanticType === "unclassified") ||
    ir.validation.some((item) =>
      [
        "unclassified",
        "missing-child-graph",
        "invalid-subcanvas-graph-id",
        "invalid-graph-id",
        "missing-parent-node-id",
        "subcanvas-ref-missing-graph",
        "missing-",
      ].some((needle) => item.id.includes(needle))
    )
  ) {
    return "draft"
  }

  return ir.validationSummary.status === "has-warnings" ? "has-warnings" : "ready"
}

function toPromptPackWarning(result: DesignIrValidationResult): PromptPackWarning | null {
  if (result.severity === "info") return null
  return {
    id: sanitizeText(result.id),
    severity: result.severity,
    targetKind: result.targetKind,
    targetId: result.targetId ? sanitizeText(result.targetId) : undefined,
    sourceGraphId: result.sourceGraphId ? sanitizeText(result.sourceGraphId) : undefined,
    field: result.field ? sanitizeText(result.field) : undefined,
    message: sanitizeText(result.message),
  }
}

function packWarnings(ir: DesignIrV1): PromptPackWarning[] {
  const warnings = ir.validation
    .map(toPromptPackWarning)
    .filter((item): item is PromptPackWarning => item !== null)

  if (stableStringify(ir).includes("[redacted-secret]")) {
    warnings.push({
      id: "prompt-pack-redacted-secret-marker",
      severity: "warning",
      targetKind: "prompt-pack",
      field: "Design IR",
      message:
        "Design IR contains a redacted secret marker; preserve secretRef or secretCapabilityRef references and do not reintroduce raw secrets.",
    })
  }

  return warnings.sort((a, b) =>
    compareText(
      `${a.severity}:${a.sourceGraphId ?? ""}:${a.targetKind}:${a.targetId ?? ""}:${a.id}`,
      `${b.severity}:${b.sourceGraphId ?? ""}:${b.targetKind}:${b.targetId ?? ""}:${b.id}`
    )
  )
}

function baseAcceptanceChecklist(ir: DesignIrV1): string[] {
  const checks = [
    "The implemented behavior matches the Design IR architecture summary.",
    "Authentication and authorization boundaries from the Design IR are enforced.",
    "Tenant, owner, and project scoping rules are preserved.",
    "Services, endpoints/APIs, data models, workers/events, policies, business rules, validation rules, and relations are represented or explicitly deferred.",
    "Unclassified items are either resolved or reported as unresolved architecture work.",
    "No raw secrets are committed, displayed, logged, or sent to clients.",
  ]

  if (ir.services.length > 0) checks.push("Service runtime, framework, tenancy, and auth mode choices are respected.")
  if (ir.endpoints.length > 0) checks.push("Endpoint methods, paths, auth requirements, and request/response expectations are covered.")
  if (ir.dataModels.length > 0) checks.push("Data models, database/ORM choices, tenant keys, indexes, and relations are handled.")
  if (ir.workers.length > 0 || ir.events.length > 0) checks.push("Worker and event flows include retry, idempotency, and delivery semantics where specified.")
  if (ir.policies.length > 0) checks.push("Security, compliance, and policy rules are enforced server-side where applicable.")

  return checks
}

function validationChecklist(targetAgent: PromptPackTargetAgent): string[] {
  const checks = [
    "Run linting or static analysis supported by the repository or builder.",
    "Run build/typecheck validation supported by the project.",
    "Run focused tests for changed backend, frontend, API, data, and security behavior.",
    "Run a smoke test for the main user flow represented by the Design IR.",
    "Verify no raw secrets appear in logs, browser output, generated files, or committed changes.",
  ]

  if (targetAgent !== "generic-ai-builder") {
    checks.push("Do not bypass failing lint, build, or test commands; report any blocker with exact output.")
  }

  return checks
}

function buildInstructions(
  targetAgent: PromptPackTargetAgent,
  ir: DesignIrV1
): PromptPackInstructions {
  const config = TARGET_CONFIG[targetAgent]
  const forbiddenChoices =
    targetAgent === "generic-ai-builder"
      ? COMMON_FORBIDDEN_CHOICES
      : [...COMMON_FORBIDDEN_CHOICES, ...REPO_FORBIDDEN_CHOICES]

  return {
    role: config.role,
    mission: [
      "Implement the application behavior described by this Prompt Pack.",
      "Treat Design IR as the architecture source of truth.",
      "Keep the result aligned with the graph hierarchy, semantic metadata, relations, assumptions, warnings, and decisions.",
      "Arc Forge generated this as an instruction artifact only; Arc Forge does not execute this pack.",
    ],
    targetGuidance: config.targetGuidance,
    forbiddenChoices,
    implementationPlan: config.implementationPlan,
    acceptanceChecklist: baseAcceptanceChecklist(ir),
    validationTestingChecklist: validationChecklist(targetAgent),
    finalReportRequirements: config.finalReportRequirements,
  }
}

function renderList(title: string, items: string[]): string[] {
  if (items.length === 0) return [`## ${title}`, "", "- None specified.", ""]
  return [`## ${title}`, "", ...items.map((item) => `- ${item}`), ""]
}

function renderSummaryItems(title: string, items: PromptPackSummaryItem[]): string[] {
  if (items.length === 0) return [`## ${title}`, "", "- None specified.", ""]

  const lines = [`## ${title}`, ""]
  for (const item of items) {
    const parent = item.parentServiceName ? `; parent service: ${item.parentServiceName}` : ""
    lines.push(`- ${item.name} (${item.semanticType}, id: ${item.id}, graph: ${item.sourceGraphId}${parent})`)
    if (item.description) lines.push(`  - Description: ${item.description}`)
    for (const detail of item.details) lines.push(`  - ${detail}`)
  }
  lines.push("")
  return lines
}

function renderRelations(relations: PromptPackRelationSummary[]): string[] {
  if (relations.length === 0) return ["## Relations / Dependencies", "", "- None specified.", ""]

  const lines = ["## Relations / Dependencies", ""]
  for (const relation of relations) {
    const labels = relation.labels.length > 0 ? `; labels: ${relation.labels.join(", ")}` : ""
    lines.push(
      `- ${relation.id}: ${relation.source} -> ${relation.target} (${relation.semanticType}, graph: ${relation.sourceGraphId}${labels})`
    )
  }
  lines.push("")
  return lines
}

function renderWarnings(warnings: PromptPackWarning[]): string[] {
  if (warnings.length === 0) return ["## Warnings", "", "- None.", ""]

  const lines = ["## Warnings", ""]
  for (const warning of warnings) {
    const target = warning.targetId ? ` ${warning.targetKind}:${warning.targetId}` : ` ${warning.targetKind}`
    const graph = warning.sourceGraphId ? ` graph:${warning.sourceGraphId}` : ""
    const field = warning.field ? ` field:${warning.field}` : ""
    lines.push(`- [${warning.severity}]${target}${graph}${field}: ${warning.message}`)
  }
  lines.push("")
  return lines
}

function renderDecisions(decisions: DesignIrDecision[]): string[] {
  if (decisions.length === 0) return ["## Decisions", "", "- None specified.", ""]

  return [
    "## Decisions",
    "",
    ...decisions.map(
      (decision) =>
        `- ${sanitizeText(decision.id)} from ${sanitizeText(decision.sourceId)} in ${sanitizeText(
          decision.sourceGraphId
        )}`
    ),
    "",
  ]
}

export function renderPromptPackMarkdown(promptPack: PromptPackV1): string {
  const { architectureSummary, instructions } = promptPack
  const lines = [
    instructions.role,
    "",
    `# Prompt Pack: ${sanitizeText(promptPack.project.name)}`,
    "",
    `- Target agent: ${promptPack.targetLabel}`,
    `- Mode: ${promptPack.mode}`,
    `- Status: ${promptPack.status}`,
    `- Design IR hash: ${promptPack.source.irHash}`,
    `- Graph count: ${promptPack.source.graphCount}`,
    "",
    "Prompt Packs are generated from Design IR. Arc Forge does not generate or execute code from this pack.",
    "",
    "## Mission",
    "",
    ...instructions.mission.map((item) => `- ${item}`),
    "",
    "## Architecture Summary",
    "",
    architectureSummary.overview,
    "",
    ...renderList("Graph Hierarchy Summary", architectureSummary.graphHierarchy),
    ...renderSummaryItems("Services", architectureSummary.services),
    ...renderSummaryItems("Endpoints / APIs", [
      ...architectureSummary.endpoints,
      ...architectureSummary.frontends,
    ]),
    ...renderSummaryItems("Data Models", architectureSummary.dataModels),
    ...renderSummaryItems("Workers / Events", [
      ...architectureSummary.workers,
      ...architectureSummary.events,
    ]),
    ...renderSummaryItems("Policies / Security", architectureSummary.policies),
    ...renderSummaryItems("Business Rules", architectureSummary.businessRules),
    ...renderSummaryItems("Validation Rules", architectureSummary.validationRules),
    ...renderSummaryItems("External Systems", architectureSummary.externalSystems),
    ...renderSummaryItems("Spec Notes", architectureSummary.notes),
    ...renderRelations(architectureSummary.relations),
    ...renderList("Assumptions", promptPack.assumptions),
    ...renderDecisions(promptPack.decisions),
    ...renderList("Source Refs", promptPack.sourceRefs),
    ...renderWarnings(promptPack.warnings),
    ...renderSummaryItems("Unclassified Items", architectureSummary.unclassifiedItems),
    ...renderList("Target Guidance", instructions.targetGuidance),
    ...renderList("Forbidden Choices", instructions.forbiddenChoices),
    ...renderList("Implementation Plan", instructions.implementationPlan),
    ...renderList("Acceptance Checklist", instructions.acceptanceChecklist),
    ...renderList("Validation / Testing Checklist", instructions.validationTestingChecklist),
    ...renderList("Final Report Requirements", instructions.finalReportRequirements),
  ]

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`
}

export function compileDesignIrToPromptPack(
  ir: DesignIrV1,
  options: PromptPackCompileOptions = {}
): PromptPackV1 {
  const targetAgent = options.targetAgent ?? "codex"
  const mode = options.mode ?? "implementation-plan"
  const config = TARGET_CONFIG[targetAgent]
  const architectureSummary = summarizeDesignIrForPromptPack(ir)
  const warnings = packWarnings(ir)
  const promptPackShell: Omit<PromptPackV1, "output"> = {
    $schema: PROMPT_PACK_SCHEMA_URL,
    packVersion: PROMPT_PACK_VERSION,
    targetAgent,
    targetLabel: config.label,
    mode,
    status: promptStatus(ir),
    project: {
      ...ir.project,
      id: sanitizeText(ir.project.id),
      name: sanitizeText(ir.project.name),
    },
    source: {
      irVersion: ir.irVersion,
      irHash: stableHashDesignIr(ir),
      compiledGraphIds: ir.scope.compiledGraphIds.map(sanitizeText),
      graphCount: ir.graphs.length,
      validationStatus: ir.validationSummary.status,
    },
    architectureSummary,
    instructions: buildInstructions(targetAgent, ir),
    warnings,
    assumptions: sanitizeStringArray(ir.assumptions),
    decisions: ir.decisions.map((decision) => ({
      id: sanitizeText(decision.id),
      sourceId: sanitizeText(decision.sourceId),
      sourceGraphId: sanitizeText(decision.sourceGraphId),
    })),
    sourceRefs: sanitizeStringArray(ir.sourceRefs),
    provenance: {
      compiler: "arc-forge-prompt-pack",
      compilerVersion: PROMPT_PACK_VERSION,
      source: "Design IR v1",
      deterministic: true,
      aiGenerated: false,
      persistedByDefault: false,
      executedByArcForge: false,
    },
  }

  const markdown = renderPromptPackMarkdown({ ...promptPackShell, output: { markdown: "" } })
  return {
    ...promptPackShell,
    output: {
      markdown,
    },
  }
}
