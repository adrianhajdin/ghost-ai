import type { CanvasEdge, CanvasNode, SemanticEdgeType } from "@/types/canvas"
import { SHAPE_DEFAULTS } from "@/types/canvas"
import { createCanvasDocV1 } from "@/lib/canvas/canvas-doc"
import {
  compileCanvasDocsToDesignIrResult,
  type DesignIrV1,
} from "@/lib/canvas/design-ir"
import { baseNodeData } from "@/lib/canvas/semantic-defaults"
import { createEdgeLabelItems, mirrorEdgeLabelData } from "@/lib/canvas/edge-labels"
import { ROOT_GRAPH_ID } from "@/lib/canvas/graph-ids"
import {
  PROMPT_PACK_TARGET_AGENTS,
  compileDesignIrToPromptPack,
  isPromptPackTargetAgent,
  renderPromptPackMarkdown,
  stableHashDesignIr,
} from "@/lib/prompt-pack/prompt-pack"

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

const childGraphId = "graph_service_billing"
const serviceNode = node("service-billing", "Billing Service", {
  semanticType: "service",
  serviceKind: "application-service",
  runtime: "node-typescript",
  language: "typescript",
  framework: "nextjs",
  tenancy: "owner-scoped-now-workspace-compatible-later",
  authMode: "internal-cookie-session",
  sourceRefs: ["docs/billing.md"],
  assumptions: ["Invoices are owner scoped."],
  decisionRefs: ["ADR-001"],
  subcanvasRef: {
    graphId: childGraphId,
    scopeKind: "service-internal",
    title: "Billing Service",
  },
})
const databaseNode = node("database-ledger", "Ledger Database", {
  semanticType: "database",
  dbKind: "relational",
  engine: "postgresql",
  orm: "prisma",
  secretRef: "secretRef:database/connection-string",
})
const authNode = node("auth-core", "Auth Core", {
  semanticType: "auth-module",
  authStrategy: "internal-cookie-session",
  sessionMode: "httpOnly-cookie",
  emailVerification: true,
})
const workerNode = node("worker-invoices", "Invoice Worker", {
  semanticType: "worker",
  triggerType: "event",
  retryPolicy: "exponential",
  idempotencyRequired: true,
})
const unclassifiedNode = node("legacy-box", "Legacy Box")
const secretNode = node("external-payments", "Payment Gateway", {
  semanticType: "external-system",
  vendorType: "payments",
  description: "token sk-abcdefghijklmnopqrstuvwxyz123456",
  secretCapabilityRef: "secretCapabilityRef:payments/charge",
})

const rootDoc = createCanvasDocV1(
  {
    nodes: [serviceNode, databaseNode, authNode, workerNode, unclassifiedNode, secretNode],
    edges: [
      edge("edge-service-db", serviceNode.id, databaseNode.id, "db-write", [
        "writes invoices",
      ]),
      edge("edge-service-worker", serviceNode.id, workerNode.id, "invokes-worker", [
        "queues invoice jobs",
      ]),
      edge("edge-auth-service", authNode.id, serviceNode.id, "auth-check", [
        "guards billing",
      ]),
      edge("edge-unclassified", unclassifiedNode.id, serviceNode.id, "unclassified", [
        "needs classification",
      ]),
    ],
  },
  {
    projectId: "project-prompt-pack-smoke",
    graphId: ROOT_GRAPH_ID,
    scopeKind: "system-root",
    title: "Prompt Pack Smoke",
  }
)

const endpointNode = node("endpoint-create-invoice", "Create Invoice", {
  semanticType: "endpoint",
  method: "POST",
  path: "/invoices",
  authRequired: true,
  idempotent: true,
})
const entityNode = node("entity-invoice", "Invoice", {
  semanticType: "entity",
  fields: ["id", "tenantId", "total", "status"],
  tenantKey: "tenantId",
})
const eventNode = node("event-invoice-created", "Invoice Created", {
  semanticType: "event-contract",
  direction: "published",
  topic: "billing.invoice.created",
  deliveryGuarantee: "at-least-once",
})
const businessRuleNode = node("rule-positive-total", "Positive Invoice Total", {
  semanticType: "business-rule",
  ruleType: "invariant",
})
const validationRuleNode = node("validation-invoice-input", "Invoice Input Validation", {
  semanticType: "validation-rule",
  validationScope: "input",
  severity: "error",
})
const policyNode = node("policy-owner-scope", "Owner Scope Policy", {
  semanticType: "policy",
  policyKind: "security",
  enforcementMode: "server-side",
  auditRequired: true,
})

const childDoc = createCanvasDocV1(
  {
    nodes: [
      endpointNode,
      entityNode,
      eventNode,
      businessRuleNode,
      validationRuleNode,
      policyNode,
    ],
    edges: [
      edge("edge-endpoint-entity", endpointNode.id, entityNode.id, "db-write", [
        "persists invoice",
      ]),
      edge("edge-endpoint-event", endpointNode.id, eventNode.id, "event-publish", [
        "emits invoice event",
      ]),
      edge("edge-policy-endpoint", policyNode.id, endpointNode.id, "guards", [
        "owner boundary",
      ]),
      edge("edge-validation-endpoint", validationRuleNode.id, endpointNode.id, "validates", [
        "input contract",
      ]),
    ],
  },
  {
    projectId: "project-prompt-pack-smoke",
    graphId: childGraphId,
    parentNodeId: serviceNode.id,
    scopeKind: "service-internal",
    title: "Billing Service",
  }
)

const designIrResult = compileCanvasDocsToDesignIrResult([childDoc, rootDoc], {
  projectName: "Prompt Pack Smoke",
})
const ir: DesignIrV1 = designIrResult.ir

assert(
  JSON.stringify(PROMPT_PACK_TARGET_AGENTS) ===
    JSON.stringify(["codex", "claude-code", "generic-ai-builder"]),
  "Prompt Pack target agents changed"
)
assert(!isPromptPackTargetAgent("nimbus"), "Unsupported target agent was accepted")

for (const targetAgent of PROMPT_PACK_TARGET_AGENTS) {
  const packA = compileDesignIrToPromptPack(ir, { targetAgent })
  const packB = compileDesignIrToPromptPack(ir, { targetAgent })
  const jsonA = JSON.stringify(packA, null, 2)
  const jsonB = JSON.stringify(packB, null, 2)
  const markdownA = renderPromptPackMarkdown(packA)
  const markdownB = renderPromptPackMarkdown(packB)

  assert(jsonA === jsonB, `${targetAgent} JSON is not deterministic`)
  assert(markdownA === markdownB, `${targetAgent} Markdown is not deterministic`)
  assert(packA.output.markdown === markdownA, `${targetAgent} output markdown mismatch`)
  assert(packA.source.irHash === stableHashDesignIr(ir), `${targetAgent} IR hash mismatch`)
  assert(!jsonA.includes("generatedAt"), `${targetAgent} JSON contains generatedAt`)
  assert(!markdownA.includes("generatedAt"), `${targetAgent} Markdown contains generatedAt`)
  assert(!jsonA.includes("sk-abcdefghijklmnopqrstuvwxyz123456"), `${targetAgent} JSON leaked raw secret`)
  assert(
    !markdownA.includes("sk-abcdefghijklmnopqrstuvwxyz123456"),
    `${targetAgent} Markdown leaked raw secret`
  )
  assert(jsonA.includes("secretRef:database/connection-string"), `${targetAgent} lost secretRef`)
  assert(
    jsonA.includes("secretCapabilityRef:payments/charge"),
    `${targetAgent} lost secretCapabilityRef`
  )
  assert(!jsonA.includes("selected"), `${targetAgent} JSON leaked selected state`)
  assert(!jsonA.includes("dragging"), `${targetAgent} JSON leaked dragging state`)
  assert(packA.status === "draft", `${targetAgent} should be draft with unclassified items`)
  assert(packA.warnings.some((warning) => warning.id.includes("unclassified")), `${targetAgent} missing unclassified warning`)
  assert(markdownA.includes("## Forbidden Choices"), `${targetAgent} missing forbidden section`)
  assert(markdownA.includes("## Acceptance Checklist"), `${targetAgent} missing acceptance checklist`)
  assert(
    markdownA.includes("## Final Report Requirements"),
    `${targetAgent} missing final report requirements`
  )
  assert(!jsonA.toLowerCase().includes("nimbus"), `${targetAgent} JSON mentioned unsupported target`)
  assert(
    !markdownA.toLowerCase().includes("nimbus"),
    `${targetAgent} Markdown mentioned unsupported target`
  )

  if (targetAgent === "codex") {
    assert(
      markdownA.startsWith("ROLE: You are Codex working in a software repository."),
      "Codex role prefix mismatch"
    )
    assert(markdownA.includes("Create a feature branch"), "Codex branch instruction missing")
    assert(markdownA.includes("Do not use raw secrets."), "Codex raw secret rule missing")
    assert(
      markdownA.includes("If the repo conflicts with this prompt, stop and report."),
      "Codex repo conflict rule missing"
    )
  }

  if (targetAgent === "claude-code") {
    assert(
      markdownA.startsWith("ROLE: You are Claude Code working as a senior implementation agent."),
      "Claude Code role prefix mismatch"
    )
    assert(
      markdownA.includes("Use concise visible reasoning summaries only."),
      "Claude visible reasoning instruction missing"
    )
  }

  if (targetAgent === "generic-ai-builder") {
    assert(
      markdownA.startsWith("ROLE: You are an AI app builder."),
      "Generic builder role prefix mismatch"
    )
    assert(
      !markdownA.includes("Create a feature branch") && !markdownA.includes("Pull request URL"),
      "Generic builder should not instruct branch or PR workflow"
    )
  }
}

console.log("prompt pack smoke passed")
