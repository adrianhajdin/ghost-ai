import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { CanvasEdge, CanvasNode } from "@/types/canvas"
import {
  ADVANCED_EDGE_RELATIONSHIP_TYPES,
  ADVANCED_SEMANTIC_NODE_TYPES,
  DEFAULT_SEMANTIC_NODE_TYPES,
  EDGE_RELATIONSHIP_TYPES,
  NODE_COLORS,
  QUICK_EDGE_RELATIONSHIP_TYPES,
  SEMANTIC_NODE_PICKER_TYPES,
  normalizeEdgeRelationshipType,
  normalizeSemanticNodeType,
  type EdgeRelationshipType,
  type SemanticNodeType,
} from "@/types/canvas"
import { createCanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { buildCanvasPyramidFromDocs } from "@/lib/canvas/canvas-pyramid"
import { sanitizeCanvasSnapshot } from "@/lib/canvas/canvas-state"
import { validateCanvasSemantics } from "@/lib/canvas/semantic-validation"
import { baseNodeData, SEMANTIC_NODE_TEMPLATES } from "@/lib/canvas/semantic-defaults"
import { createEdgeLabelItems, mirrorEdgeLabelData } from "@/lib/canvas/edge-labels"
import { buildArchitectSystemPrompt } from "@/lib/ai/architect/architect-provider-contract"
import { buildPromptPackSystemPrompt } from "@/lib/ai/prompt-pack/prompt-pack-provider-contract"

const root = process.cwd()

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function read(path: string) {
  return readFileSync(join(root, path), "utf8")
}

function term(...parts: string[]) {
  return parts.join("")
}

function node(id: string, semanticType: string): CanvasNode {
  return {
    id,
    type: "canvasNode",
    position: { x: 0, y: 0 },
    width: 160,
    height: 80,
    data: {
      ...baseNodeData(id),
      semanticType: semanticType as SemanticNodeType,
      label: id,
      name: id,
      description: `${id} responsibility.`,
      responsibilities: [`Own ${id}`],
      owner: "platform-team",
      boundary: "system",
      layerRole: "component",
      interfacesExposed: ["api"],
      interfacesConsumed: ["auth"],
      dataOwned: ["state"],
      dataRead: ["reference-data"],
      eventsEmitted: ["created"],
      eventsConsumed: ["requested"],
      status: "draft",
      maturity: "draft",
      color: NODE_COLORS[0].fill,
      textColor: NODE_COLORS[0].text,
      shape: "rectangle",
      subcanvasRef: {
        graphId: `graph_${id.replace(/_/g, "-").replace(/[^a-z0-9-]+/g, "-")}`,
        scopeKind: "architecture-layer",
        title: `${id} Layer`,
      },
    },
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  relationshipType?: EdgeRelationshipType
): CanvasEdge {
  const labelItems = createEdgeLabelItems(
    ["primary label", "secondary label"],
    [
      { id: `${id}-primary`, text: "primary label" },
      { id: `${id}-secondary`, text: "secondary label" },
    ],
    id
  )
  return {
    id,
    type: "canvasEdge",
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
    data: {
      ...(relationshipType
        ? { semanticType: relationshipType, relationshipType }
        : { semanticType: "unclassified" as const }),
      name: "primary label",
      status: "draft",
      mechanism: "http",
      protocol: "https",
      dataSubject: "orders",
      eventSubject: "order.created",
      syncMode: relationshipType === "publishes" || relationshipType === "consumes" ? "async" : "unknown",
      securityNotes: "uses server-side auth",
      trustNotes: "same trust zone",
      ...mirrorEdgeLabelData(labelItems),
    },
  }
}

const requiredNodeTypes = [
  "actor",
  "client-surface",
  "event-channel",
  "cache-store",
  "object-store",
  "service",
  "worker",
  "database",
  "identity-auth",
  "external-system",
  "generic-component",
] as const

for (const type of requiredNodeTypes) {
  assert(
    DEFAULT_SEMANTIC_NODE_TYPES.includes(type as never) ||
      ADVANCED_SEMANTIC_NODE_TYPES.includes(type as never),
    `Missing Phase 1 node type: ${type}`
  )
  assert(
    SEMANTIC_NODE_PICKER_TYPES.includes(type as never),
    `Node type is not available in semantic picker: ${type}`
  )
}

assert(
  normalizeSemanticNodeType("frontend") === "client-surface",
  "Legacy frontend did not map to client-surface"
)
assert(
  normalizeSemanticNodeType("auth-module") === "identity-auth",
  "Legacy auth-module did not map to identity-auth"
)
assert(
  normalizeSemanticNodeType("worker") === "worker",
  "Worker type did not remain worker"
)
assert(
  normalizeSemanticNodeType("external-system") === "external-system",
  "External system type did not remain external-system"
)

const templates = new Set(SEMANTIC_NODE_TEMPLATES.map((template) => template.semanticType))
for (const type of requiredNodeTypes) {
  assert(templates.has(type), `Missing add-node template for ${type}`)
}

const typedNodes = requiredNodeTypes.map((type) => node(type, type))
const customNode = node("custom-special", "bespoke-runtime")
const sanitizedNodes = sanitizeCanvasSnapshot({ nodes: [...typedNodes, customNode], edges: [] }).nodes

for (const type of requiredNodeTypes) {
  const found = sanitizedNodes.find((item) => item.id === type)
  assert(found?.data.subcanvasRef?.graphId, `${type} did not preserve subcanvasRef`)
}

assert(
  sanitizedNodes.find((item) => item.id === "actor")?.data.subcanvasRef?.graphId,
  "Actor cannot carry child layer metadata"
)
assert(
  sanitizedNodes.find((item) => item.id === "generic-component")?.data.subcanvasRef?.graphId,
  "Generic component cannot carry child layer metadata"
)
const sanitizedCustom = sanitizedNodes.find((item) => item.id === "custom-special")
assert(sanitizedCustom, "Custom node did not survive")
assert(
  sanitizedCustom.data.semanticType === "generic-component",
  "Custom semantic node did not use generic-component fallback"
)
assert(
  sanitizedCustom.data.originalSemanticType === "bespoke-runtime",
  "Custom semantic node did not preserve originalSemanticType"
)

const quickRelationships = [
  "interacts_with",
  "calls",
  "reads",
  "writes",
  "publishes",
  "consumes",
  "authenticates_via",
  "runs_on",
] as const
const advancedRelationships = ["triggers", "monitors", "depends_on", "syncs_with"] as const

for (const type of quickRelationships) {
  assert(QUICK_EDGE_RELATIONSHIP_TYPES.includes(type), `Missing quick relationship: ${type}`)
}
for (const type of advancedRelationships) {
  assert(ADVANCED_EDGE_RELATIONSHIP_TYPES.includes(type), `Missing advanced relationship: ${type}`)
}
for (const type of [...quickRelationships, ...advancedRelationships]) {
  assert(EDGE_RELATIONSHIP_TYPES.includes(type), `Missing relationship type: ${type}`)
}
assert(normalizeEdgeRelationshipType("http-call") === "calls", "Legacy http-call did not map")
assert(normalizeEdgeRelationshipType("db-read") === "reads", "Legacy db-read did not map")
assert(normalizeEdgeRelationshipType("db-write") === "writes", "Legacy db-write did not map")
assert(normalizeEdgeRelationshipType("auth-check") === "authenticates_via", "Legacy auth-check did not map")

const source = node("source-service", "service")
const target = node("target-database", "database")
const relationshipEdge = sanitizeCanvasSnapshot({
  nodes: [source, target],
  edges: [edge("edge-writes", source.id, target.id, "writes")],
}).edges[0]
assert(relationshipEdge?.data?.relationshipType === "writes", "relationshipType did not persist")
assert(relationshipEdge.data.labelItems?.length === 2, "edge labelItems did not persist")
assert(relationshipEdge.data.labels?.[1] === "secondary label", "multiple edge labels did not persist")

const oldUntypedEdge = sanitizeCanvasSnapshot({
  nodes: [source, target],
  edges: [edge("old-edge", source.id, target.id)],
}).edges[0]
assert(oldUntypedEdge, "Old edge without relationshipType did not load")
const untypedWarnings = validateCanvasSemantics({ nodes: [source, target], edges: [oldUntypedEdge] })
assert(
  untypedWarnings.some((warning) => warning.field === "relationshipType"),
  "Semantic scan did not warn for untyped edge"
)
assert(
  untypedWarnings.every((warning) => warning.severity !== "error"),
  "Untyped edge warning became blocking"
)

const metadataNode = sanitizeCanvasSnapshot({
  nodes: [
    {
      ...node("metadata-node", "actor"),
      data: {
        ...node("metadata-node", "actor").data,
        responsibilities: ["Approve access"],
        interfacesExposed: ["identity request"],
        interfacesConsumed: ["audit report"],
        dataOwned: ["profile"],
        dataRead: ["tenant policy"],
        eventsEmitted: ["access.requested"],
        eventsConsumed: ["policy.changed"],
        technology: "browser",
        runtimeKind: "human",
        securityNotes: "no raw secrets",
        privacyClass: "internal",
        operationalNotes: "manual review",
        openQuestions: ["approval SLA"],
        promptPackNotes: "Ask implementation agent to keep UX explicit.",
        apiKey: "sk-abcdefghijklmnopqrstuvwxyz123456",
      },
    },
  ],
  edges: [],
}).nodes[0]
assert(metadataNode?.data.responsibilities?.[0] === "Approve access", "responsibilities did not persist")
assert(metadataNode.data.interfacesExposed?.[0] === "identity request", "interfacesExposed did not persist")
assert(metadataNode.data.dataOwned?.[0] === "profile", "dataOwned did not persist")
assert(metadataNode.data.eventsConsumed?.[0] === "policy.changed", "eventsConsumed did not persist")
assert(!("apiKey" in metadataNode.data), "Raw secret-like metadata field persisted")

const doc = createCanvasDocV1(
  { nodes: [metadataNode], edges: [relationshipEdge] },
  { projectId: "phase1-smoke", graphId: "graph_root", title: "Phase 1 Smoke" }
)
const pyramid = buildCanvasPyramidFromDocs("phase1-smoke", [doc])
const pyramidJson = JSON.stringify(pyramid)
for (const value of [
  "Approve access",
  "identity request",
  "access.requested",
  "writes",
  "https",
]) {
  assert(pyramidJson.includes(value), `Canvas pyramid missed metadata value: ${value}`)
}

const toolbarSource = read("components/editor/canvas/shape-panel.tsx")
for (const text of [
  "Add Semantic Node",
  "Connect Relationship",
  "Drill-down Layer",
  "Inspect Metadata",
  "Annotate",
  "add-semantic-node-picker",
  "connect-relationship-picker",
  "drill-down-layer-mode",
]) {
  assert(toolbarSource.includes(text), `Toolbar source missed ${text}`)
}
assert(!toolbarSource.includes(term("AWS", " icon")), "Toolbar added provider-specific icon copy")
assert(!toolbarSource.includes(term("B", "PMN")), "Toolbar added process-notation palette copy")

const inspectorSource = read("components/editor/canvas/semantic-inspector.tsx")
for (const text of [
  "Responsibilities",
  "Boundary",
  "Layer role",
  "Interfaces exposed",
  "Data owned",
  "Events emitted",
  "Relationship type",
  "Mechanism",
  "Security / Trust",
]) {
  assert(inspectorSource.includes(text), `Metadata drawer missed ${text}`)
}

const architectPrompt = buildArchitectSystemPrompt()
assert(architectPrompt.includes("client-surface"), "Architect prompt missed new node taxonomy")
assert(architectPrompt.includes("relationshipType"), "Architect prompt missed typed edge guidance")
assert(!architectPrompt.includes(term("payment", "_", "call")), "Architect prompt allowed payment-specific edge type")
assert(!architectPrompt.includes(term("trust", "_", "boundary", "_", "crossing")), "Architect prompt allowed trust-boundary edge type")

const promptPackPrompt = buildPromptPackSystemPrompt()
assert(promptPackPrompt.includes("responsibilities"), "Prompt Pack prompt missed compact metadata")
assert(promptPackPrompt.includes("relationshipTypes"), "Prompt Pack prompt missed typed edge guidance")

assert(existsSync(join(root, "app/api/ai/architect/route.ts")), "Architect route missing")
assert(existsSync(join(root, "app/api/ai/prompt-pack/route.ts")), "Prompt Pack route missing")
assert(!existsSync(join(root, "app/api/ai", "design/route.ts")), "Legacy design route exists")
assert(!existsSync(join(root, "lib/ai", "design")), "Legacy AI design lib exists")

const packageJson = read("package.json")
for (const legacy of [
  term("compile", "Project", "Prompt", "Pack"),
  term("generate", "Design", "Actions"),
  term("@", "clerk"),
  term("@", "liveblocks"),
  term("@", "trigger.dev"),
]) {
  assert(!packageJson.includes(legacy), `Legacy package/runtime term present: ${legacy}`)
}

console.log("canvas v2 phase1 smoke passed")
