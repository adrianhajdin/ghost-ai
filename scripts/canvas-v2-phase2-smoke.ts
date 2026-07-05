import { mkdtemp } from "node:fs/promises"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import os from "node:os"
import type { CanvasEdge, CanvasNode } from "@/types/canvas"
import { createCanvasDocV1, normalizeCanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { buildCanvasPyramidFromDocs } from "@/lib/canvas/canvas-pyramid"
import {
  EMPTY_SEMANTIC_SCAN_STATE,
  groupSemanticFindings,
  isSemanticFindingHidden,
  normalizeSemanticScanState,
  validateCanvasSemantics,
} from "@/lib/canvas/semantic-validation"
import { baseNodeData } from "@/lib/canvas/semantic-defaults"
import {
  applyChildLayerSummaryToParentDoc,
  childLayerMetadataPatch,
  createMechanicalLayerSummary,
  decompositionStatusForLayer,
} from "@/lib/canvas/child-layer-summary"
import { applyLlmCanvasImprovementProposal } from "@/lib/canvas/llm-canvas-patch"
import { writeCanvasDoc, readCanvasDoc } from "@/lib/canvas/canvas-persistence"
import { buildArchitectSystemPrompt } from "@/lib/ai/architect/architect-provider-contract"
import { buildPromptPackSystemPrompt } from "@/lib/ai/prompt-pack/prompt-pack-provider-contract"

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
      description: `${label} responsibility.`,
      responsibilities: [`Own ${label}`],
      owner: "platform",
      boundary: "internal",
      layerRole: "component",
      status: "draft",
      semanticType: "service",
      shape: "rectangle",
      color: "#102a43",
      textColor: "#e6f6ff",
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
      status: "draft",
      ...data,
    },
  }
}

const inspectorSource = read("components/editor/canvas/semantic-inspector.tsx")
for (const text of [
  "Overview",
  "Interfaces",
  "Data",
  "Events",
  "Security",
  "Operations",
  "Prompt Pack Notes",
  "Open Questions",
  "Mechanism",
  "Data / Events",
  "Security / Trust",
  "Mark intentional",
  "Snooze",
  "semanticScanState",
]) {
  assert(inspectorSource.includes(text), `Inspector source missed Phase 2 affordance: ${text}`)
}
assert(inspectorSource.includes("<details"), "Inspector does not use progressive disclosure sections")

const unclassified = node("node-unclassified", "Producer", {
  semanticType: "unclassified",
  responsibilities: [],
})
const service = node("service", "Checkout Service", {
  semanticType: "service",
  interfacesExposed: ["POST /checkout"],
  dataOwned: ["checkout session"],
  eventsEmitted: ["checkout.started"],
  securityNotes: "uses authenticated customer session",
  operationalNotes: "horizontal replicas behind queue",
  scalingNotes: "scale on queue depth",
  observabilityNotes: "trace checkout span",
  failureModes: ["payment timeout"],
  promptPackNotes: "Keep payment adapter behind a port.",
  secretRef: "secret://payments/stripe",
})
const database = node("database", "Order Database", {
  semanticType: "database",
  dbKind: "relational",
  engine: "postgresql",
  dataOwned: ["orders"],
  retentionNotes: "retain orders for policy window",
  backupNotes: "daily point-in-time backup",
})
const untypedEdge = edge("edge-untyped", "service", "database", {
  semanticType: "unclassified",
  relationshipType: undefined,
  label: "uses",
  labels: ["uses"],
})

const findings = validateCanvasSemantics({
  nodes: [unclassified, service, database],
  edges: [untypedEdge],
})
assert(findings.length > 0, "Semantic scan did not produce advisory findings")
assert(
  findings.some((finding) => finding.category === "topology-quality"),
  "Semantic scan missed topology-quality category"
)
assert(
  findings.some((finding) => finding.category === "relationship-clarity"),
  "Semantic scan missed relationship-clarity category"
)
assert(
  findings.every((finding) => typeof finding.advisory === "boolean" && typeof finding.blocking === "boolean"),
  "Semantic findings do not expose advisory/blocking flags"
)
assert(
  findings.filter((finding) => finding.severity !== "error").every((finding) => finding.advisory),
  "Non-error semantic findings should remain advisory"
)
assert(groupSemanticFindings(findings).size >= 2, "Semantic findings were not grouped by category")

const warningFinding = findings.find((finding) => finding.severity !== "error")
assert(warningFinding, "Expected at least one advisory warning")
const hiddenState = normalizeSemanticScanState({
  dismissedFindingIds: [warningFinding.id],
  intentionalFindingIds: [],
})
assert(isSemanticFindingHidden(warningFinding, hiddenState), "Dismissed advisory finding was not hidden")
const rawSecretNode = node("secret-node", "Secret Node", {
  apiKey: "sk-abcdefghijklmnopqrstuvwxyz123456",
})
const [rawSecretFinding] = validateCanvasSemantics({ nodes: [rawSecretNode], edges: [] }).filter(
  (finding) => finding.category === "safety"
)
assert(rawSecretFinding?.blocking, "Raw secret semantic finding is not blocking")
assert(
  !isSemanticFindingHidden(rawSecretFinding, {
    dismissedFindingIds: [rawSecretFinding.id],
    intentionalFindingIds: [],
  }),
  "Blocking safety finding should not be hidden"
)

const scanDoc = normalizeCanvasDocV1(
  {
    ...createCanvasDocV1({ nodes: [service], edges: [] }, {
      projectId: "phase2-panels",
      graphId: "graph_panels",
      title: "Panels",
      panels: {
        semanticScan: {
          dismissedFindingIds: [warningFinding.id],
          intentionalFindingIds: [],
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    }),
  },
  { projectId: "phase2-panels", graphId: "graph_panels" }
)
assert(
  normalizeSemanticScanState(scanDoc.panels.semanticScan).dismissedFindingIds[0] === warningFinding.id,
  "Semantic scan panel state did not persist through CanvasDoc normalization"
)
assert(
  normalizeSemanticScanState(EMPTY_SEMANTIC_SCAN_STATE).dismissedFindingIds.length === 0,
  "Empty semantic scan state did not normalize"
)

const emptyChildDoc = createCanvasDocV1(
  { nodes: [], edges: [] },
  {
    projectId: "phase2-child",
    graphId: "graph_child",
    parentGraphId: "graph_parent",
    parentNodeId: "service",
    title: "Service Layer",
    summary: "Internal service layer",
  }
)
assert(createMechanicalLayerSummary(emptyChildDoc) === "Empty child layer", "Empty child summary mismatch")
assert(
  decompositionStatusForLayer({ doc: emptyChildDoc, existingSummary: null }) === "planned",
  "Empty child layer should be planned"
)
const populatedChildDoc = createCanvasDocV1(
  { nodes: [node("endpoint", "POST /checkout", { semanticType: "endpoint" })], edges: [] },
  {
    projectId: "phase2-child",
    graphId: "graph_child",
    parentGraphId: "graph_parent",
    parentNodeId: "service",
    title: "Service Layer",
    summary: "Endpoint internals",
  }
)
const childMetadata = childLayerMetadataPatch({
  childDoc: populatedChildDoc,
  existingParentNode: service,
  authoredSummary: "Endpoint internals",
  now: "2026-02-01T00:00:00.000Z",
})
assert(childMetadata.hasChildLayer, "Child layer metadata did not mark hasChildLayer")
assert(childMetadata.childLayerSummary?.includes("Endpoint"), "Child layer metadata missed authored summary")
const parentDoc = createCanvasDocV1(
  {
    nodes: [
      {
        ...service,
        data: {
          ...service.data,
          subcanvasRef: {
            graphId: "graph_child",
            scopeKind: "architecture-layer",
            title: "Service Layer",
          },
        },
      },
    ],
    edges: [],
  },
  { projectId: "phase2-child", graphId: "graph_parent", title: "Parent" }
)
const nextParentDoc = applyChildLayerSummaryToParentDoc({
  parentDoc,
  childDoc: populatedChildDoc,
  authoredSummary: "Endpoint internals",
  now: "2026-02-01T00:00:00.000Z",
})
assert(
  nextParentDoc.nodes[0]?.data.childLayerSummary?.includes("Endpoint"),
  "Parent doc did not receive child layer summary"
)

const pyramid = buildCanvasPyramidFromDocs("phase2-pyramid", [nextParentDoc, populatedChildDoc])
const parentGraph = pyramid.graphs.find((graph) => graph.graphId === "graph_parent")
assert(parentGraph?.nodes[0]?.metadataSummary.childLayer, "Canvas pyramid missed childLayer metadata summary")
assert(parentGraph.semanticScan.activeCount >= 0, "Canvas pyramid missed semanticScan summary")
assert(
  JSON.stringify(parentGraph.nodes[0]?.metadataSummary).includes("Endpoint internals"),
  "Canvas pyramid metadata summary missed child layer details"
)

const architectPrompt = buildArchitectSystemPrompt()
for (const text of ["semanticScan", "metadataSummary", "childLayerSummary", "advisory quality signals"]) {
  assert(architectPrompt.includes(text), `Architect prompt missed ${text}`)
}
const promptPackPrompt = buildPromptPackSystemPrompt()
for (const text of ["semanticScan", "metadataSummary", "childLayerSummary", "not hard blockers"]) {
  assert(promptPackPrompt.includes(text), `Prompt Pack prompt missed ${text}`)
}

assert(existsSync(join(root, "app", "api", "ai", "architect", "route.ts")), "Architect route missing")
assert(
  !existsSync(join(root, "app", "api", "ai", "design", "route.ts")),
  "Legacy AI route exists"
)
assert(!existsSync(join(root, "lib", "ai", "design")), "Legacy AI design lib exists")

async function runLayerUpsertSmoke() {
  const storageRoot = await mkdtemp(join(os.tmpdir(), "arc-forge-phase2-"))
  process.env.STORAGE_PROVIDER = "local_fs"
  process.env.LOCAL_STORAGE_ROOT = storageRoot

  const projectId = "project-phase2-layer-upsert"
  const graphParent = "graph_phase2_parent"
  const graphChild = "graph_phase2_child"
  const parent = createCanvasDocV1(
    {
      nodes: [
        {
          ...service,
          id: "selected-service",
          data: {
            ...service.data,
            name: "Selected Service",
            label: "Selected Service",
            subcanvasRef: {
              graphId: graphChild,
              scopeKind: "architecture-layer",
              title: "Selected Service Layer",
            },
          },
        },
      ],
      edges: [],
    },
    {
      projectId,
      graphId: graphParent,
      title: "Parent Graph",
    }
  )
  const child = createCanvasDocV1(
    { nodes: [], edges: [] },
    {
      projectId,
      graphId: graphChild,
      parentGraphId: graphParent,
      parentNodeId: "selected-service",
      title: "Selected Service Layer",
      summary: "Empty before apply",
    }
  )

  await writeCanvasDoc(projectId, parent, { graphId: graphParent })
  await writeCanvasDoc(projectId, child, {
    graphId: graphChild,
    parentGraphId: graphParent,
    parentNodeId: "selected-service",
    scopeKind: "architecture-layer",
    title: "Selected Service Layer",
    summary: "Empty before apply",
  })

  const result = await applyLlmCanvasImprovementProposal({
    projectId,
    currentGraphId: graphParent,
    proposal: {
      summary: "Populate existing child layer",
      operations: [
        {
          op: "create-layer",
          parentGraphId: graphParent,
          parentNodeId: "selected-service",
          graph: {
            title: "Selected Service Layer",
            summary: "Endpoint and entity internals",
            nodes: [
              {
                tempId: "endpoint",
                label: "POST /orders",
                semanticType: "endpoint",
                description: "Accepts order creation requests.",
                position: { x: 0, y: 0 },
              },
              {
                tempId: "entity",
                label: "Order",
                semanticType: "entity",
                description: "Persists order state.",
                position: { x: 240, y: 0 },
              },
            ],
            edges: [
              {
                source: "endpoint",
                target: "entity",
                relationshipType: "writes",
                label: "writes order",
                metadata: { dataSubject: "order" },
              },
            ],
          },
        },
      ],
    },
  })

  assert(result.applied.createLayers === 1, "Existing child layer create-layer was not applied")
  assert(result.applied.skippedOperations === 0, "Existing child layer create-layer was skipped")
  assert(result.dirtyGraphIds.includes(graphChild), "Child graph was not marked dirty")
  assert(result.dirtyGraphIds.includes(graphParent), "Parent graph summary was not marked dirty")

  const writtenChild = await readCanvasDoc(projectId, graphChild)
  assert(writtenChild?.nodes.length === 2, "Existing child graph did not receive internal nodes")
  assert(writtenChild.edges.length === 1, "Existing child graph did not receive internal edge")
  const writtenParent = await readCanvasDoc(projectId, graphParent)
  const writtenParentNode = writtenParent?.nodes.find((item) => item.id === "selected-service")
  assert(
    writtenParentNode?.data.subcanvasRef?.graphId === graphChild,
    "Parent node lost existing subcanvasRef"
  )
  assert(
    writtenParentNode.data.childLayerSummary?.includes("Endpoint"),
    "Parent node did not receive updated child layer summary after apply"
  )
}

runLayerUpsertSmoke()
  .then(() => {
    console.log("canvas v2 phase2 smoke passed")
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
