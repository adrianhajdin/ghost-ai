import { z } from "zod"
import {
  LLM_TRANSPORT_TRANSIENT_KEYS,
  sanitizeLlmTransportRecord,
  sanitizeLlmTransportValue,
} from "@/lib/canvas/canvas-pyramid"
import {
  looksLikeRawSecretValue,
  shouldStripSecretField,
} from "@/lib/canvas/secret-guards"

const ALLOWED_CANVAS_PATCH_OPS = [
  "update-node",
  "add-node",
  "add-edge",
  "create-layer",
  "update-graph",
] as const

const PositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

const PatchNodeSchema = z
  .object({
    id: z.string().trim().min(1).max(120).optional(),
    label: z.string().trim().min(1).max(240),
    semanticType: z.string().trim().min(1).max(120).optional(),
    type: z.string().trim().min(1).max(120).optional(),
    name: z.string().trim().max(240).optional(),
    description: z.string().trim().max(4000).optional(),
    metadata: z.record(z.unknown()).default({}),
    position: PositionSchema.optional(),
  })
  .passthrough()

const PatchEdgeSchema = z
  .object({
    id: z.string().trim().min(1).max(120).optional(),
    source: z.string().trim().min(1).max(120),
    target: z.string().trim().min(1).max(120),
    relationshipType: z.string().trim().min(1).max(120).optional(),
    semanticType: z.string().trim().min(1).max(120).optional(),
    type: z.string().trim().min(1).max(120).optional(),
    label: z.string().trim().max(240).optional(),
    labels: z.array(z.string().trim().max(240)).max(8).default([]),
    metadata: z.record(z.unknown()).default({}),
  })
  .passthrough()

const UpdateNodeOperationSchema = z.object({
  op: z.literal("update-node"),
  graphId: z.string().trim().min(1).max(120),
  nodeId: z.string().trim().min(1).max(120),
  patch: z.record(z.unknown()).default({}),
})

const AddNodeOperationSchema = z.object({
  op: z.literal("add-node"),
  graphId: z.string().trim().min(1).max(120),
  tempId: z.string().trim().min(1).max(120).optional(),
  node: PatchNodeSchema,
})

const AddEdgeOperationSchema = z.object({
  op: z.literal("add-edge"),
  graphId: z.string().trim().min(1).max(120),
  tempId: z.string().trim().min(1).max(120).optional(),
  edge: PatchEdgeSchema,
})

const CreateLayerOperationSchema = z.object({
  op: z.literal("create-layer"),
  parentGraphId: z.string().trim().min(1).max(120),
  parentNodeId: z.string().trim().min(1).max(120),
  graph: z
    .object({
      title: z.string().trim().min(1).max(240),
      layerKind: z.string().trim().min(1).max(120).optional(),
      summary: z.string().trim().max(2000).optional(),
      nodes: z.array(PatchNodeSchema).default([]),
      edges: z.array(PatchEdgeSchema).default([]),
    })
    .passthrough(),
})

const UpdateGraphOperationSchema = z.object({
  op: z.literal("update-graph"),
  graphId: z.string().trim().min(1).max(120),
  patch: z
    .object({
      title: z.string().trim().min(1).max(240).optional(),
      summary: z.string().trim().max(2000).optional(),
      layerKind: z.string().trim().min(1).max(120).optional(),
      metadata: z.record(z.unknown()).optional(),
    })
    .passthrough(),
})

const UnsupportedCanvasPatchOperationSchema = z
  .object({
    op: z
      .string()
      .trim()
      .min(1)
      .refine(
        (op) =>
          !(ALLOWED_CANVAS_PATCH_OPS as readonly string[]).includes(op),
        "Allowed patch operations must include their required transport fields."
      ),
  })
  .passthrough()

export const LlmCanvasPatchOperationSchema = z.union([
  UpdateNodeOperationSchema,
  AddNodeOperationSchema,
  AddEdgeOperationSchema,
  CreateLayerOperationSchema,
  UpdateGraphOperationSchema,
  UnsupportedCanvasPatchOperationSchema,
])

export const LlmCanvasImprovementProposalSchema = z
  .object({
    summary: z.string().trim().max(4000).default(""),
    operations: z.array(LlmCanvasPatchOperationSchema).default([]),
  })
  .passthrough()

export type LlmCanvasPatchOperation = z.infer<typeof LlmCanvasPatchOperationSchema>
export type LlmCanvasImprovementProposal = z.infer<
  typeof LlmCanvasImprovementProposalSchema
>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function collectUnsafeTransportIssues(
  value: unknown,
  path: string,
  key: string,
  issues: string[]
) {
  if (LLM_TRANSPORT_TRANSIENT_KEYS.has(key)) {
    issues.push(`Transient UI state is not allowed at ${path || key}.`)
    return
  }

  if (shouldStripSecretField(key, value)) {
    issues.push(`Raw secret-looking value detected at ${path || key}.`)
    return
  }

  if (typeof value === "string" && looksLikeRawSecretValue(value)) {
    issues.push(`Raw secret-looking value detected at ${path || key || "root"}.`)
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectUnsafeTransportIssues(item, `${path}[${index}]`, key, issues)
    })
    return
  }

  if (isRecord(value)) {
    for (const [childKey, childValue] of Object.entries(value)) {
      collectUnsafeTransportIssues(
        childValue,
        path ? `${path}.${childKey}` : childKey,
        childKey,
        issues
      )
    }
  }
}

export function getLlmCanvasPatchTransportIssues(value: unknown) {
  const issues: string[] = []
  collectUnsafeTransportIssues(value, "", "", issues)
  return issues
}

export function sanitizeLlmCanvasPatchRecord(value: unknown) {
  return sanitizeLlmTransportRecord(value)
}

export function sanitizeLlmCanvasPatchValue(value: unknown) {
  return sanitizeLlmTransportValue(value)
}

export function extractLlmCanvasImprovementProposal(
  value: unknown
): LlmCanvasImprovementProposal {
  const parsed = LlmCanvasImprovementProposalSchema.safeParse(value)
  if (parsed.success) return parsed.data

  if (isRecord(value)) {
    const nested = value.canvasImprovementProposal ?? value.canvasPatchProposal
    const nestedParsed = LlmCanvasImprovementProposalSchema.safeParse(nested)
    if (nestedParsed.success) return nestedParsed.data
  }

  return { summary: "", operations: [] }
}
