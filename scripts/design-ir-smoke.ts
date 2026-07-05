import type { CanvasEdge, CanvasNode, SemanticEdgeType } from "@/types/canvas"
import { NODE_COLORS, SHAPE_DEFAULTS } from "@/types/canvas"
import { createCanvasDocV1 } from "@/lib/canvas/canvas-doc"
import {
  compileCanvasDocsToDesignIrResult,
  compileCanvasDocsToDesignIrV1,
} from "@/lib/canvas/design-ir"
import { baseNodeData } from "@/lib/canvas/semantic-defaults"
import { createEdgeLabelItems, mirrorEdgeLabelData } from "@/lib/canvas/edge-labels"
import {
  ROOT_GRAPH_ID,
  assertValidGraphId,
} from "@/lib/canvas/graph-ids"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
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

function edge(
  id: string,
  source: string,
  target: string,
  semanticType: SemanticEdgeType,
  labels: string[]
): CanvasEdge {
  const labelItems = createEdgeLabelItems(
    labels,
    labels.map((text, index) => ({ id: `${id}-label-${index}`, text })),
    id
  )

  return {
    id,
    type: "canvasEdge",
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
    selected: true,
    data: {
      semanticType,
      ...mirrorEdgeLabelData(labelItems),
    },
  }
}

const childGraphId = "graph_service_payments"
const serviceNode = node("service-payments", "Payments Service", {
  semanticType: "service",
  serviceKind: "application-service",
  runtime: "node-typescript",
  language: "typescript",
  framework: "nextjs",
  tenancy: "owner-scoped-now-workspace-compatible-later",
  authMode: "internal-cookie-session",
  subcanvasRef: {
    graphId: childGraphId,
    scopeKind: "service-internal",
    title: "Payments Service",
  },
  color: NODE_COLORS[1].fill,
  textColor: NODE_COLORS[1].text,
})
const databaseNode = node("database-main", "Primary Database", {
  semanticType: "database",
  dbKind: "relational",
  engine: "postgresql",
  orm: "prisma",
})
const actorNode = node("actor-admin", "Ops Admin", {
  semanticType: "actor",
  description: "Operator who reviews settlement exceptions.",
  responsibilities: ["Review exceptions"],
})
const unclassifiedNode = node("legacy-shape", "Legacy Shape")
const secretNode = node("external-payments", "Payment Provider", {
  semanticType: "external-system",
  vendorType: "payments",
  description: "token sk-abcdefghijklmnopqrstuvwxyz123456",
  secretRef: "secretRef:stripe/api-key",
})

const rootDoc = createCanvasDocV1(
  {
    nodes: [unclassifiedNode, secretNode, actorNode, serviceNode, databaseNode],
    edges: [
      edge("edge-service-db", serviceNode.id, databaseNode.id, "db-write", [
        "writes",
        "ledger",
      ]),
      edge("edge-legacy-service", unclassifiedNode.id, serviceNode.id, "unclassified", [
        "needs-classification",
      ]),
    ],
  },
  {
    projectId: "project-design-ir-smoke",
    graphId: ROOT_GRAPH_ID,
    scopeKind: "system-root",
    title: "Smoke System",
  }
)

const endpointNode = node("endpoint-create-payment", "Create Payment", {
  semanticType: "endpoint",
  method: "POST",
  path: "/payments",
  authRequired: true,
  draftText: "transient edit",
})
const entityNode = node("entity-payment", "Payment", {
  semanticType: "entity",
  fields: ["id", "amount", "tenantId"],
  tenantKey: "tenantId",
})
const childDoc = createCanvasDocV1(
  {
    nodes: [endpointNode, entityNode],
    edges: [
      edge("edge-endpoint-entity", endpointNode.id, entityNode.id, "db-write", [
        "writes",
        "payment aggregate",
      ]),
    ],
  },
  {
    projectId: "project-design-ir-smoke",
    graphId: childGraphId,
    parentNodeId: serviceNode.id,
    scopeKind: "service-internal",
    title: "Payments Service",
  }
)

const rootOnly = compileCanvasDocsToDesignIrResult([rootDoc], {
  projectName: "Smoke System",
  rootOnly: true,
})
assert(rootOnly.ir.scope.compiledGraphIds.length === 1, "root-only IR compiled child graphs")
assert(rootOnly.ir.endpoints.length === 0, "root-only IR should not contain child endpoints")

const resultA = compileCanvasDocsToDesignIrResult([rootDoc, childDoc], {
  projectName: "Smoke System",
})
const resultB = compileCanvasDocsToDesignIrResult([childDoc, rootDoc], {
  projectName: "Smoke System",
})
assert(JSON.stringify(resultA.ir) === JSON.stringify(resultB.ir), "Design IR is not deterministic")

assert(resultA.graphCount === 2, "Design IR did not compile root and child graph")
assert(
  resultA.ir.scope.compiledGraphIds[0] === ROOT_GRAPH_ID &&
    resultA.ir.scope.compiledGraphIds[1] === childGraphId,
  "compiledGraphIds are not deterministic"
)
assert(resultA.ir.services.some((item) => item.id === serviceNode.id), "service missing")
assert(resultA.ir.dataModels.some((item) => item.id === databaseNode.id), "database missing")
assert(
  resultA.ir.endpoints.some(
    (item) =>
      item.id === endpointNode.id &&
      item.parentServiceId === serviceNode.id &&
      item.sourceGraphId === childGraphId
  ),
  "endpoint missing parentServiceId/sourceGraphId"
)
assert(
  resultA.ir.dataModels.some(
    (item) =>
      item.id === entityNode.id &&
      item.parentServiceId === serviceNode.id &&
      item.sourceGraphId === childGraphId
  ),
  "entity missing parentServiceId/sourceGraphId"
)

const rootDbRelation = resultA.ir.relations.find((item) => item.id === "edge-service-db")
assert(rootDbRelation?.sourceGraphId === ROOT_GRAPH_ID, "root relation sourceGraphId missing")
assert(rootDbRelation?.labels[1] === "ledger", "root relation labels were not preserved")
assert(
  resultA.ir.actors.some((item) => item.id === actorNode.id),
  "actor node missing from Design IR actors"
)

const childDbRelation = resultA.ir.relations.find((item) => item.id === "edge-endpoint-entity")
assert(childDbRelation?.sourceGraphId === childGraphId, "child relation sourceGraphId missing")
assert(childDbRelation?.kind === "writes", "child db-write alias did not normalize to writes")
assert(
  childDbRelation?.sourceNodeType === "endpoint" && childDbRelation.targetNodeType === "entity",
  "child relation node types missing"
)
assert(
  childDbRelation?.labels[1] === "payment aggregate",
  "child relation labelItems/labels were not preserved"
)

assert(
  resultA.ir.genericComponents.some((item) => item.id === unclassifiedNode.id),
  "generic fallback node missing from Design IR genericComponents"
)
assert(
  resultA.validation.some((item) => item.id.includes("unclassified")),
  "untyped relation validation warning missing"
)
assert(
  resultA.validation.some((item) => item.id.includes("generic-description")),
  "generic fallback metadata warning missing"
)

const missingChildDoc = createCanvasDocV1(
  {
    nodes: [
      node("service-missing-child", "Missing Child Service", {
        semanticType: "service",
        serviceKind: "application-service",
        runtime: "node-typescript",
        subcanvasRef: {
          graphId: "graph_missing_child",
          scopeKind: "service-internal",
          title: "Missing Child",
        },
      }),
    ],
    edges: [],
  },
  { projectId: "project-design-ir-smoke", title: "Missing Child System" }
)
const missingChild = compileCanvasDocsToDesignIrResult([missingChildDoc], {
  projectName: "Missing Child System",
})
assert(
  missingChild.validation.some((item) => item.id.includes("missing-child-graph")),
  "missing child graph warning missing"
)

const exportedJson = JSON.stringify(resultA.ir)
assert(!exportedJson.includes("sk-abcdefghijklmnopqrstuvwxyz123456"), "raw secret leaked into IR")
assert(exportedJson.includes("[redacted-secret]"), "redacted secret marker missing")
assert(exportedJson.includes("secretRef:stripe/api-key"), "secretRef did not survive IR")
assert(
  resultA.validation.some((item) => item.id.includes("secret-data-description")),
  "raw secret redaction warning missing"
)
assert(!exportedJson.includes("selected"), "selected UI state leaked into IR")
assert(!exportedJson.includes("dragging"), "dragging UI state leaked into IR")
assert(!exportedJson.includes("draftText"), "draft edit state leaked into IR")
assert(!exportedJson.includes("compiledAt"), "transient compiledAt leaked into IR")

let rejectedTraversalGraphId = false
try {
  assertValidGraphId("../../secret")
} catch {
  rejectedTraversalGraphId = true
}
assert(rejectedTraversalGraphId, "path traversal graph id was accepted")

const irOnly = compileCanvasDocsToDesignIrV1([rootDoc, childDoc], {
  projectName: "Smoke System",
})
assert(irOnly.provenance.deterministic === true, "IR provenance is not deterministic")

console.log("design ir smoke passed")
