import type { Node, Edge } from "@xyflow/react"

export const CANVAS_DOC_VERSION = "1.0.0" as const
export const DESIGN_IR_VERSION = "1.0.0" as const
export const SEMANTIC_TAXONOMY_VERSION = "1.0.0" as const

export const NODE_SHAPES = [
  "rectangle",
  "diamond",
  "circle",
  "pill",
  "cylinder",
  "hexagon",
] as const

export type NodeShape = (typeof NODE_SHAPES)[number]

export const SEMANTIC_NODE_TYPES = [
  "unclassified",
  "service",
  "api",
  "frontend",
  "database",
  "cache",
  "queue",
  "worker",
  "external-system",
  "auth-module",
  "domain-model",
  "entity",
  "endpoint-group",
  "endpoint",
  "event-contract",
  "business-rule",
  "validation-rule",
  "policy",
  "spec-note",
] as const

export type SemanticNodeType = (typeof SEMANTIC_NODE_TYPES)[number]

export const SEMANTIC_EDGE_TYPES = [
  "unclassified",
  "http-call",
  "graphql-call",
  "db-read",
  "db-write",
  "event-publish",
  "event-consume",
  "webhook-in",
  "webhook-out",
  "auth-check",
  "depends-on",
  "invokes-worker",
  "contains",
  "guards",
  "validates",
] as const

export type SemanticEdgeType = (typeof SEMANTIC_EDGE_TYPES)[number]

export type CanvasMetadataStatus = "draft" | "approved" | "deprecated"

export interface CanvasEdgeLabelItem {
  id: string
  text: string
}

export type CanvasSubcanvasScopeKind =
  | "service-internal"
  | "api-design"
  | "database-design"
  | "auth-design"
  | "worker-design"
  | "architecture-layer"

export interface CanvasSubcanvasRef {
  graphId: string
  scopeKind?: CanvasSubcanvasScopeKind
  title?: string
  parentGraphId?: string
  parentNodeId?: string
  layer?: number
  layerKind?: string
  summary?: string
  createdAt?: string
  updatedAt?: string
  llmLayerPurpose?: string
}

export interface SemanticDefinition<TType extends string> {
  type: TType
  label: string
  purpose: string
  requiredFields: readonly string[]
  recommendedFields: readonly string[]
}

export const SEMANTIC_NODE_DEFINITIONS = {
  unclassified: {
    type: "unclassified",
    label: "Unclassified",
    purpose: "Compatibility placeholder until the user chooses a semantic type.",
    requiredFields: ["id"],
    recommendedFields: ["name", "description"],
  },
  service: {
    type: "service",
    label: "Service",
    purpose: "Microservice or bounded application context.",
    requiredFields: ["id", "name", "serviceKind", "runtime"],
    recommendedFields: ["owner", "language", "framework", "ports", "sla", "tenancy", "authMode"],
  },
  api: {
    type: "api",
    label: "API",
    purpose: "API surface of a service.",
    requiredFields: ["id", "name", "apiStyle"],
    recommendedFields: ["basePath", "version", "openapiRef", "graphqlRef", "authRequired"],
  },
  frontend: {
    type: "frontend",
    label: "Frontend",
    purpose: "Web app, admin panel, mobile shell, or client experience.",
    requiredFields: ["id", "name", "clientKind"],
    recommendedFields: ["framework", "routes", "authFlow", "consumedApis"],
  },
  database: {
    type: "database",
    label: "Database",
    purpose: "Relational, document, or key-value data store.",
    requiredFields: ["id", "name", "dbKind"],
    recommendedFields: ["engine", "schemaMode", "orm", "backupClass", "retention"],
  },
  cache: {
    type: "cache",
    label: "Cache",
    purpose: "Cache or ephemeral storage.",
    requiredFields: ["id", "name", "cacheKind"],
    recommendedFields: ["ttlPolicy", "evictionPolicy", "sharedAcrossTenants"],
  },
  queue: {
    type: "queue",
    label: "Queue",
    purpose: "Broker, queue, topic bus, or async messaging channel.",
    requiredFields: ["id", "name", "messagingKind"],
    recommendedFields: ["deliverySemantics", "ordering", "deadLetterPolicy"],
  },
  worker: {
    type: "worker",
    label: "Worker",
    purpose: "Background processor or job runner.",
    requiredFields: ["id", "name", "triggerType"],
    recommendedFields: ["concurrency", "retryPolicy", "idempotencyRequired"],
  },
  "external-system": {
    type: "external-system",
    label: "External System",
    purpose: "External dependency or vendor service.",
    requiredFields: ["id", "name", "vendorType"],
    recommendedFields: ["authType", "rateLimit", "slaAssumption", "webhookSupport"],
  },
  "auth-module": {
    type: "auth-module",
    label: "Auth Module",
    purpose: "Authentication, session, and token flow boundary.",
    requiredFields: ["id", "name", "authStrategy"],
    recommendedFields: ["sessionMode", "passwordPolicy", "emailVerification", "oauthProviders"],
  },
  "domain-model": {
    type: "domain-model",
    label: "Domain Model",
    purpose: "Entity group or aggregate.",
    requiredFields: ["id", "name", "aggregateKind"],
    recommendedFields: ["entities", "invariants", "lifecycleStates"],
  },
  entity: {
    type: "entity",
    label: "Entity",
    purpose: "Individual data model.",
    requiredFields: ["id", "name", "fields"],
    recommendedFields: ["indexes", "uniques", "relations", "softDelete", "tenantKey"],
  },
  "endpoint-group": {
    type: "endpoint-group",
    label: "Endpoint Group",
    purpose: "Group of related endpoints.",
    requiredFields: ["id", "name"],
    recommendedFields: ["pathPrefix", "resourceName", "crudStyle", "errorStyle"],
  },
  endpoint: {
    type: "endpoint",
    label: "Endpoint",
    purpose: "Concrete API operation.",
    requiredFields: ["id", "method", "path"],
    recommendedFields: ["requestSchema", "responseSchema", "auth", "rateLimit", "idempotent"],
  },
  "event-contract": {
    type: "event-contract",
    label: "Event Contract",
    purpose: "Published or consumed event contract.",
    requiredFields: ["id", "name", "direction"],
    recommendedFields: ["topic", "payloadSchema", "deliveryGuarantee", "version"],
  },
  "business-rule": {
    type: "business-rule",
    label: "Business Rule",
    purpose: "Functional rule or invariant.",
    requiredFields: ["id", "name", "ruleType"],
    recommendedFields: ["expression", "priority", "failureMode", "testCases"],
  },
  "validation-rule": {
    type: "validation-rule",
    label: "Validation Rule",
    purpose: "Input, output, or flow validation.",
    requiredFields: ["id", "name", "validationScope"],
    recommendedFields: ["schemaRef", "severity", "errorCode"],
  },
  policy: {
    type: "policy",
    label: "Policy",
    purpose: "Security, tenancy, privacy, or compliance rule.",
    requiredFields: ["id", "name", "policyKind"],
    recommendedFields: ["appliesTo", "enforcementMode", "auditRequired"],
  },
  "spec-note": {
    type: "spec-note",
    label: "Spec Note",
    purpose: "Structured technical note.",
    requiredFields: ["id", "title"],
    recommendedFields: ["markdown", "citations", "decisionRef"],
  },
} as const satisfies Record<SemanticNodeType, SemanticDefinition<SemanticNodeType>>

export const SEMANTIC_EDGE_DEFINITIONS = {
  unclassified: {
    type: "unclassified",
    label: "Unclassified",
    purpose: "Compatibility placeholder until the user chooses a semantic edge type.",
    requiredFields: ["id", "source", "target"],
    recommendedFields: ["label"],
  },
  "http-call": {
    type: "http-call",
    label: "HTTP Call",
    purpose: "Synchronous HTTP request.",
    requiredFields: ["id", "source", "target", "operationHint"],
    recommendedFields: ["method", "path", "auth", "timeoutMs", "retryPolicy"],
  },
  "graphql-call": {
    type: "graphql-call",
    label: "GraphQL Call",
    purpose: "GraphQL query, mutation, or subscription.",
    requiredFields: ["id", "source", "target", "operationName"],
    recommendedFields: ["rootType", "selectionSetHint", "auth"],
  },
  "db-read": {
    type: "db-read",
    label: "DB Read",
    purpose: "Read from a store.",
    requiredFields: ["id", "source", "target"],
    recommendedFields: ["entityRefs", "consistency", "throughOrm"],
  },
  "db-write": {
    type: "db-write",
    label: "DB Write",
    purpose: "Write to a store.",
    requiredFields: ["id", "source", "target"],
    recommendedFields: ["entityRefs", "transactionality", "idempotent"],
  },
  "event-publish": {
    type: "event-publish",
    label: "Event Publish",
    purpose: "Publish an event.",
    requiredFields: ["id", "source", "target", "eventName"],
    recommendedFields: ["topic", "payloadRef", "deliveryGuarantee", "ordering"],
  },
  "event-consume": {
    type: "event-consume",
    label: "Event Consume",
    purpose: "Consume an event.",
    requiredFields: ["id", "source", "target", "eventName"],
    recommendedFields: ["handlerName", "retryPolicy", "deadLetterPolicy"],
  },
  "webhook-in": {
    type: "webhook-in",
    label: "Webhook In",
    purpose: "Received webhook.",
    requiredFields: ["id", "source", "target"],
    recommendedFields: ["signatureScheme", "verification", "replayProtection"],
  },
  "webhook-out": {
    type: "webhook-out",
    label: "Webhook Out",
    purpose: "Sent webhook.",
    requiredFields: ["id", "source", "target"],
    recommendedFields: ["signing", "retryPolicy", "backoff"],
  },
  "auth-check": {
    type: "auth-check",
    label: "Auth Check",
    purpose: "Auth or session check.",
    requiredFields: ["id", "source", "target"],
    recommendedFields: ["authMode", "requiredScopes", "tenantBoundary"],
  },
  "depends-on": {
    type: "depends-on",
    label: "Depends On",
    purpose: "Structural dependency.",
    requiredFields: ["id", "source", "target"],
    recommendedFields: ["criticality", "fallback"],
  },
  "invokes-worker": {
    type: "invokes-worker",
    label: "Invokes Worker",
    purpose: "Trigger a worker or job.",
    requiredFields: ["id", "source", "target"],
    recommendedFields: ["triggerMode", "schedule", "payloadRef"],
  },
  contains: {
    type: "contains",
    label: "Contains",
    purpose: "Parent or subcanvas relation.",
    requiredFields: ["id", "source", "target"],
    recommendedFields: ["scopeKind", "inheritPolicies"],
  },
  guards: {
    type: "guards",
    label: "Guards",
    purpose: "Policy or rule applied to a target.",
    requiredFields: ["id", "source", "target"],
    recommendedFields: ["enforcementPoint", "blocking"],
  },
  validates: {
    type: "validates",
    label: "Validates",
    purpose: "Validation over a flow or model.",
    requiredFields: ["id", "source", "target"],
    recommendedFields: ["stage", "severity"],
  },
} as const satisfies Record<SemanticEdgeType, SemanticDefinition<SemanticEdgeType>>

export const NODE_COLORS = [
  { fill: "#1F1F1F", text: "#EDEDED" },
  { fill: "#10233D", text: "#52A8FF" },
  { fill: "#2E1938", text: "#BF7AF0" },
  { fill: "#331B00", text: "#FF990A" },
  { fill: "#3C1618", text: "#FF6166" },
  { fill: "#3A1726", text: "#F75F8F" },
  { fill: "#0F2E18", text: "#62C073" },
  { fill: "#062822", text: "#0AC7B4" },
] as const

export const SHAPE_DEFAULTS: Record<NodeShape, { width: number; height: number }> = {
  rectangle: { width: 160, height: 80 },
  diamond: { width: 160, height: 120 },
  circle: { width: 100, height: 100 },
  pill: { width: 160, height: 72 },
  cylinder: { width: 120, height: 100 },
  hexagon: { width: 140, height: 120 },
}

export interface CanvasNodeData extends Record<string, unknown> {
  label: string
  semanticType?: SemanticNodeType
  name?: string
  description?: string
  tags?: string[]
  status?: CanvasMetadataStatus
  sourceRefs?: string[]
  assumptions?: string[]
  decisionRefs?: string[]
  owner?: string | null
  createdAt?: string
  updatedAt?: string
  subcanvasRef?: CanvasSubcanvasRef | null
  color?: string
  textColor?: string
  shape?: NodeShape
  serviceKind?: string
  runtime?: string
  language?: string
  framework?: string
  tenancy?: string
  authMode?: string
  dbKind?: string
  engine?: string
  orm?: string
  triggerType?: string
  retryPolicy?: string
  idempotencyRequired?: boolean
  authStrategy?: string
  sessionMode?: string
  emailVerification?: boolean
  method?: string
  path?: string
  authRequired?: boolean
  idempotent?: boolean
  fields?: string[]
  tenantKey?: string
  direction?: string
  topic?: string
  deliveryGuarantee?: string
  ruleType?: string
  validationScope?: string
  severity?: string
  policyKind?: string
  enforcementMode?: string
  auditRequired?: boolean
}

export interface CanvasEdgeData extends Record<string, unknown> {
  semanticType?: SemanticEdgeType
  name?: string
  label?: string
  labels?: string[]
  labelItems?: CanvasEdgeLabelItem[]
  description?: string
  tags?: string[]
  status?: CanvasMetadataStatus
  sourceRefs?: string[]
  assumptions?: string[]
  decisionRefs?: string[]
  owner?: string | null
  createdAt?: string
  updatedAt?: string
  operationHint?: string
  operationName?: string
  method?: string
  path?: string
  auth?: string
  timeoutMs?: string | number
  retryPolicy?: string
  eventName?: string
  topic?: string
}

export type CanvasNode = Node<CanvasNodeData, "canvasNode">
export type CanvasEdge = Edge<CanvasEdgeData, "canvasEdge">

export function isSemanticNodeType(value: unknown): value is SemanticNodeType {
  return typeof value === "string" && SEMANTIC_NODE_TYPES.includes(value as SemanticNodeType)
}

export function isSemanticEdgeType(value: unknown): value is SemanticEdgeType {
  return typeof value === "string" && SEMANTIC_EDGE_TYPES.includes(value as SemanticEdgeType)
}

export function semanticNodeTypeLabel(type: string | undefined): string {
  return isSemanticNodeType(type)
    ? SEMANTIC_NODE_DEFINITIONS[type].label
    : SEMANTIC_NODE_DEFINITIONS.unclassified.label
}

export function semanticEdgeTypeLabel(type: string | undefined): string {
  return isSemanticEdgeType(type)
    ? SEMANTIC_EDGE_DEFINITIONS[type].label
    : SEMANTIC_EDGE_DEFINITIONS.unclassified.label
}
