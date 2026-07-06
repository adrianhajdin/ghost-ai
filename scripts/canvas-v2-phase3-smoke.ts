import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { CanvasEdge, CanvasNode } from "@/types/canvas"
import {
  ADVANCED_EDGE_RELATIONSHIP_TYPES,
  ADVANCED_SEMANTIC_NODE_TYPES,
  DEFAULT_SEMANTIC_NODE_TYPES,
  EDGE_RELATIONSHIP_TYPES,
  QUICK_EDGE_RELATIONSHIP_TYPES,
  normalizeEdgeRelationshipType,
} from "@/types/canvas"
import { createCanvasDocV1, normalizeCanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { sanitizeCanvasSnapshot } from "@/lib/canvas/canvas-state"
import { buildCanvasPyramidFromDocs } from "@/lib/canvas/canvas-pyramid"
import { baseNodeData, SEMANTIC_NODE_TEMPLATES } from "@/lib/canvas/semantic-defaults"
import {
  EMPTY_SEMANTIC_SCAN_STATE,
  isSemanticFindingHidden,
  validateCanvasSemantics,
} from "@/lib/canvas/semantic-validation"
import { buildArchitectSystemPrompt } from "@/lib/ai/architect/architect-provider-contract"
import { buildPromptPackSystemPrompt } from "@/lib/ai/prompt-pack/prompt-pack-provider-contract"
import { buildArchitectureDraftSystemPrompt } from "@/lib/ai/architecture-draft/architecture-draft-provider-contract"
import {
  applyArchitectureDraftProposalToCanvasDoc,
  parseArchitectureDraftProposal,
} from "@/lib/architecture-draft/architecture-draft"

const root = process.cwd()

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function read(path: string) {
  return readFileSync(join(root, path), "utf8")
}

function node(
  id: string,
  label: string,
  data: Partial<CanvasNode["data"]> = {}
): CanvasNode {
  return {
    id,
    type: "canvasNode",
    position: { x: 0, y: 0 },
    width: 180,
    height: 96,
    data: {
      ...baseNodeData(label),
      label,
      name: label,
      description: `${label} architecture role.`,
      responsibilities: [`Own ${label}`],
      semanticType: "service",
      owner: "platform",
      boundary: "internal",
      status: "draft",
      ...data,
    },
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  data: Partial<NonNullable<CanvasEdge["data"]>> = {}
): CanvasEdge {
  return {
    id,
    type: "canvasEdge",
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
    data: {
      semanticType: "calls",
      relationshipType: "calls",
      label: "calls",
      labels: ["calls"],
      labelItems: [
        { id: `${id}-label-1`, text: "primary label" },
        { id: `${id}-label-2`, text: "secondary label" },
      ],
      status: "draft",
      ...data,
    },
  }
}

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
  assert(EDGE_RELATIONSHIP_TYPES.includes(type), `Missing relationship type: ${type}`)
}
for (const type of advancedRelationships) {
  assert(ADVANCED_EDGE_RELATIONSHIP_TYPES.includes(type), `Missing advanced relationship: ${type}`)
  assert(EDGE_RELATIONSHIP_TYPES.includes(type), `Missing relationship type: ${type}`)
}
const disallowedPaymentRelationship = ["payment", "call"].join("_")
const disallowedBoundaryRelationship = ["trust", "boundary", "crossing"].join("_")
assert(
  !EDGE_RELATIONSHIP_TYPES.includes(disallowedPaymentRelationship as never),
  "Payment-specific edge type must not exist"
)
assert(
  !EDGE_RELATIONSHIP_TYPES.includes(disallowedBoundaryRelationship as never),
  "Trust-boundary edge type must not exist"
)
assert(normalizeEdgeRelationshipType("http-call") === "calls", "Legacy http-call did not map")
assert(normalizeEdgeRelationshipType("db-read") === "reads", "Legacy db-read did not map")
assert(normalizeEdgeRelationshipType("db-write") === "writes", "Legacy db-write did not map")
assert(normalizeEdgeRelationshipType("auth-check") === "authenticates_via", "Legacy auth-check did not map")

const phase3Types = [
  "reference-proxy",
  "runtime-deployment",
  "observability-control",
  "ai-component",
] as const
for (const type of phase3Types) {
  assert(ADVANCED_SEMANTIC_NODE_TYPES.includes(type), `${type} is not advanced`)
  assert(!DEFAULT_SEMANTIC_NODE_TYPES.includes(type as never), `${type} leaked into default palette`)
  const template = SEMANTIC_NODE_TEMPLATES.find((item) => item.semanticType === type)
  assert(template?.group === "advanced", `${type} template is not advanced/contextual`)
}

const persisted = sanitizeCanvasSnapshot({
  nodes: [
    node("proxy", "Checkout DB Proxy", {
      semanticType: "reference-proxy",
      boundary: "internal",
      trustZone: "service-child",
      exposure: "internal",
      dataSensitivity: "confidential",
      authExpectation: "inherits parent service auth",
      trustNotes: "Context-only reference.",
      signalTypes: ["logs"],
      environment: "prod",
      region: "eu-west",
      aiRole: "retrieval-router",
      modelProvider: "provider-wrapper",
      modelClass: "llm",
      toolAccess: ["search"],
      safetyNotes: "Do not expose tools without policy.",
      retrievalNotes: "Use curated docs only.",
      costNotes: "Bound token budgets.",
      referenceKind: "node",
      referencedGraphId: "graph_root",
      referencedNodeId: "database",
      referencedLabel: "Order Database",
      referenceRole: "reads customer orders",
      proxyDirection: "outbound",
      referenceNotes: "Shown for cross-layer context only.",
      subcanvasRef: {
        graphId: "graph_proxy",
        scopeKind: "architecture-layer",
        title: "Proxy Notes",
      },
      apiKey: "sk-abcdefghijklmnopqrstuvwxyz123456",
    }),
  ],
  edges: [
    edge("edge-rich", "proxy", "proxy", {
      relationshipType: "calls",
      semanticType: "calls",
      criticality: "critical",
      directionality: "directed",
      reliability: "retry at caller boundary",
      retryPolicy: "exponential backoff",
      idempotencyNotes: "idempotency key required",
      consistency: "read-your-writes not required",
      rateLimitNotes: "provider quota applies",
      timeoutNotes: "3s app timeout",
      fallbackNotes: "queue fallback",
      ownershipNotes: "platform owns retries",
    }),
  ],
})
const persistedNode = persisted.nodes[0]
const persistedEdge = persisted.edges[0]
assert(persistedNode, "Expected persisted proxy node")
assert(persistedEdge?.data, "Expected persisted rich edge")
assert(persistedNode?.data.semanticType === "reference-proxy", "reference-proxy did not persist")
assert(persistedNode.data.hasChildLayer, "Reference Proxy child layer did not persist")
assert(persistedNode.data.referencedGraphId === "graph_root", "Proxy referencedGraphId did not persist")
assert(persistedNode.data.referencedNodeId === "database", "Proxy referencedNodeId did not persist")
assert(persistedNode.data.toolAccess?.[0] === "search", "AI toolAccess did not normalize")
assert(!("apiKey" in persistedNode.data), "Raw secret-looking key persisted on node")
assert(persistedEdge?.data.criticality === "critical", "Edge criticality did not persist")
assert(persistedEdge.data.directionality === "directed", "Edge directionality did not persist")
assert(persistedEdge.data.reliability === "retry at caller boundary", "Edge reliability did not persist")
assert(persistedEdge.data.labelItems?.length === 2, "Multiple edge label bubbles did not persist")

const publicClient = node("client", "Public Client", {
  semanticType: "client-surface",
  boundary: "public",
  exposure: "public",
  securityNotes: "",
  authExpectation: "",
  authMode: "",
})
const service = node("service", "Checkout Service", {
  semanticType: "service",
  boundary: "internal",
})
const database = node("database", "Order Database", {
  semanticType: "database",
  boundary: "regulated",
  dataSensitivity: "regulated",
  privacyClass: "",
  securityNotes: "",
  owner: "",
})
const external = node("provider", "Model Provider", {
  semanticType: "external-system",
  boundary: "external",
  trustNotes: "",
  securityNotes: "",
  authType: "",
})
const worker = node("worker", "Invoice Worker", {
  semanticType: "worker",
  retryPolicy: "",
  idempotencyRequired: false,
})
const eventChannel = node("events", "Order Events", {
  semanticType: "event-channel",
})
const runtime = node("runtime", "Checkout Runtime", {
  semanticType: "runtime-deployment",
  runtimeKind: "",
  owner: "",
})
const observability = node("observability", "Ops Control", {
  semanticType: "observability-control",
  signalTypes: [],
  operationalNotes: "",
})
const aiComponent = node("ai", "AI Router", {
  semanticType: "ai-component",
  safetyNotes: "",
  securityNotes: "",
  trustNotes: "",
  privacyClass: "",
  toolAccess: [],
})
const proxy = node("proxy-warning", "Provider Proxy", {
  semanticType: "reference-proxy",
  referencedGraphId: "",
  referencedNodeId: "",
})

const findings = validateCanvasSemantics({
  nodes: [
    publicClient,
    service,
    database,
    external,
    worker,
    eventChannel,
    runtime,
    observability,
    aiComponent,
    proxy,
  ],
  edges: [
    edge("calls-missing", "client", "service", { relationshipType: "calls", mechanism: "", protocol: "" }),
    edge("reads-missing", "service", "database", { relationshipType: "reads", dataSubject: "" }),
    edge("writes-missing", "service", "database", { relationshipType: "writes", dataSubject: "" }),
    edge("publishes-missing", "service", "events", { relationshipType: "publishes", eventSubject: "", topic: "" }),
    edge("consumes-missing", "events", "worker", {
      relationshipType: "consumes",
      eventSubject: "order.created",
      retryPolicy: "",
      idempotencyNotes: "",
    }),
    edge("auth-missing", "client", "service", { relationshipType: "authenticates_via", securityNotes: "", auth: "" }),
    edge("runs-on-missing", "service", "runtime", { relationshipType: "runs_on" }),
    edge("monitors-missing", "service", "observability", { relationshipType: "monitors", mechanism: "", reliability: "" }),
    edge("ai-provider-missing", "ai", "provider", { relationshipType: "calls", trustNotes: "", securityNotes: "" }),
  ],
})

function hasFinding(field: string, category?: string) {
  return findings.some((finding) => finding.field === field && (!category || finding.category === category))
}

assert(hasFinding("mechanism"), "Semantic scan missed calls mechanism/protocol advisory")
assert(hasFinding("dataSubject"), "Semantic scan missed reads/writes dataSubject advisory")
assert(hasFinding("eventSubject"), "Semantic scan missed publish/consume event advisory")
assert(hasFinding("retryPolicy"), "Semantic scan missed worker consume retry/idempotency advisory")
assert(hasFinding("securityNotes"), "Semantic scan missed auth security advisory")
assert(hasFinding("runtimeKind", "runtime-operations"), "Semantic scan missed runtime advisory")
assert(hasFinding("signalTypes", "runtime-operations"), "Semantic scan missed observability advisory")
assert(hasFinding("safetyNotes", "ai-governance"), "Semantic scan missed AI governance advisory")
assert(hasFinding("trustNotes", "trust-boundaries"), "Semantic scan missed trust boundary advisory")
assert(hasFinding("referencedGraphId", "cross-layer-references"), "Semantic scan missed proxy target advisory")
assert(
  findings.filter((finding) => finding.category !== "safety").every((finding) => finding.advisory && !finding.blocking),
  "Non-safety Phase 3 semantic findings must remain advisory"
)

const advisory = findings.find((finding) => finding.category === "trust-boundaries")
assert(advisory, "Expected advisory trust finding")
assert(
  isSemanticFindingHidden(advisory, {
    dismissedFindingIds: [advisory.id],
    intentionalFindingIds: [],
  }),
  "Snooze did not hide advisory trust finding"
)
const rawSecretFinding = validateCanvasSemantics({
  nodes: [node("secret", "Secret", { password: "plain-secret-password-1234567890" })],
  edges: [],
}).find((finding) => finding.category === "safety")
assert(rawSecretFinding?.blocking, "Raw secret finding was not blocking")
assert(
  !isSemanticFindingHidden(rawSecretFinding, {
    dismissedFindingIds: [rawSecretFinding.id],
    intentionalFindingIds: [],
  }),
  "Snooze/intentional hid a raw-secret safety finding"
)
assert(EMPTY_SEMANTIC_SCAN_STATE.dismissedFindingIds.length === 0, "Empty scan state mutated")

const rootDoc = createCanvasDocV1(
  { nodes: [service, database, persistedNode], edges: [persistedEdge] },
  {
    projectId: "phase3",
    graphId: "graph_root",
    title: "Root",
    panels: {
      trustBoundaryLegend: { internal: "owned", external: "third-party" },
      boundaryNotes: "Boundaries are advisory metadata.",
    },
  }
)
const normalizedDoc = normalizeCanvasDocV1(rootDoc, { projectId: "phase3", graphId: "graph_root" })
assert(normalizedDoc.panels.trustBoundaryLegend, "Trust boundary legend panel did not persist")
assert(normalizedDoc.panels.boundaryNotes === "Boundaries are advisory metadata.", "Boundary notes did not persist")

const pyramid = buildCanvasPyramidFromDocs("phase3", [normalizedDoc])
const proxySummary = pyramid.graphs[0]?.nodes.find((item) => item.id === "proxy")?.metadataSummary
assert(proxySummary?.reference, "Proxy metadata summary missing")
assert(
  JSON.stringify(proxySummary.reference).includes('"implementationTarget":false'),
  "Proxy summary did not mark proxy as non-owned implementation context"
)
const edgeSummary = pyramid.graphs[0]?.edges[0]?.metadataSummary
assert(edgeSummary?.criticality === "critical", "Edge metadata summary missed criticality")
assert(edgeSummary?.idempotencyNotes === "idempotency key required", "Edge metadata summary missed idempotency notes")

for (const semanticType of ["actor", "generic-component", "reference-proxy"] as const) {
  const childLayerNode = sanitizeCanvasSnapshot({
    nodes: [
      node(`child-${semanticType}`, semanticType, {
        semanticType,
        subcanvasRef: {
          graphId: `graph_${semanticType.replace("-", "_")}`,
          scopeKind: "architecture-layer",
          title: `${semanticType} layer`,
        },
      }),
    ],
    edges: [],
  }).nodes[0]
  assert(childLayerNode?.data.hasChildLayer, `${semanticType} child layer was restricted`)
}
const customChildLayerNode = sanitizeCanvasSnapshot({
  nodes: [
    node("custom-child", "Custom", {
      semanticType: "custom-cross-layer-thing" as never,
      subcanvasRef: { graphId: "graph_custom", scopeKind: "architecture-layer", title: "Custom" },
    }),
  ],
  edges: [],
}).nodes[0]
assert(customChildLayerNode?.data.hasChildLayer, "Custom node child layer was restricted")
assert(customChildLayerNode.data.semanticType === "generic-component", "Custom semantic type did not normalize safely")

const architectPrompt = buildArchitectSystemPrompt()
for (const text of [
  "reference-proxy",
  "runtime-deployment",
  "observability-control",
  "ai-component",
  "trust boundary metadata",
  "retry/idempotency notes",
]) {
  assert(architectPrompt.includes(text), `Architect prompt missed ${text}`)
}
const promptPackPrompt = buildPromptPackSystemPrompt()
for (const text of [
  "reference-proxy",
  "implementation target",
  "trust boundary metadata",
  "criticality",
  "runtime/deployment notes",
]) {
  assert(promptPackPrompt.includes(text), `Prompt Pack prompt missed ${text}`)
}
const draftPrompt = buildArchitectureDraftSystemPrompt()
for (const text of ["reference-proxy", "runtime-deployment", "observability-control", "ai-component"]) {
  assert(draftPrompt.includes(text), `Architecture Draft prompt missed ${text}`)
}

const draftProposal = parseArchitectureDraftProposal({
  $schema: "https://arcforge.dev/schemas/architecture-draft.v1.json",
  draftVersion: "1.0.0",
  status: "draft",
  title: "Phase 3 Advanced Types",
  summary: "Advanced semantic type smoke.",
  targetGraphId: "graph_root",
  complexity: "standard",
  nodes: [
    { id: "runtime", semanticType: "runtime-deployment", label: "Runtime" },
    { id: "observability", semanticType: "observability-control", label: "Observability" },
    { id: "ai", semanticType: "ai-component", label: "AI Gateway" },
    {
      id: "proxy",
      semanticType: "reference-proxy",
      label: "Root DB Proxy",
      metadata: { referencedGraphId: "graph_root", referencedNodeId: "database" },
    },
  ],
  edges: [
    { source: "ai", target: "runtime", relationshipType: "runs_on", label: "runs on" },
  ],
  graphs: [],
  clarificationQuestions: [],
  assumptions: [],
  warnings: [],
  suggestedNextSteps: [],
})
const applyResult = applyArchitectureDraftProposalToCanvasDoc(
  createCanvasDocV1({ nodes: [], edges: [] }, { projectId: "phase3", graphId: "graph_root" }),
  draftProposal
)
assert(applyResult.ok, "Architecture Draft did not accept advanced Phase 3 semantic types")
assert(applyResult.doc.nodes.some((item) => item.data.semanticType === "ai-component"), "AI Component did not apply to canvas")

const inspectorSource = read("components/editor/canvas/semantic-inspector.tsx")
for (const text of ["Reference Proxy", "Reliability", "Exposure", "Data sensitivity", "Safety notes"]) {
  assert(inspectorSource.includes(text), `Inspector missed Phase 3 affordance: ${text}`)
}
const shapePanelSource = read("components/editor/canvas/shape-panel.tsx")
assert(shapePanelSource.includes("Use calls for request/response"), "Relationship quick guidance missing")
assert(shapePanelSource.includes('template.group !== "advanced"'), "Default semantic toolbar no longer filters advanced templates")

assert(existsSync(join(root, "app", "api", "ai", "architect", "route.ts")), "Architect route missing")
assert(existsSync(join(root, "app", "api", "ai", "prompt-pack", "route.ts")), "Prompt Pack route missing")
assert(!existsSync(join(root, "app", "api", "ai", "design", "route.ts")), "Legacy AI design route exists")
assert(!existsSync(join(root, "lib", "ai", "design")), "Legacy AI design library exists")

const guardedSources = [
  read("lib/ai/architect/architect-provider-contract.ts"),
  read("lib/ai/prompt-pack/prompt-pack-provider-contract.ts"),
  read("lib/ai/architecture-draft/architecture-draft-provider-contract.ts"),
]
assert(
  guardedSources.every((source) => source.includes("does not build") || source.includes("not an application-building runtime")),
  "Arc Forge app-builder guardrail wording missing"
)
assert(
  !read("types/canvas.ts").includes(JSON.stringify(disallowedPaymentRelationship)) &&
    !read("types/canvas.ts").includes(JSON.stringify(disallowedBoundaryRelationship)),
  "Forbidden edge type names leaked into canvas types"
)

console.log("canvas v2 phase3 smoke passed")
