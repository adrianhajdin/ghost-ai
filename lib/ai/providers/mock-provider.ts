import {
  buildSpecContext,
  type GenerateSpecMarkdownInput,
} from "@/lib/ai/spec/spec-provider-contract"
import {
  validateDesignProviderResult,
  type DesignAction,
} from "@/lib/ai/design/design-actions"
import type {
  GenerateDesignActionsInput,
  GenerateDesignActionsResult,
} from "@/lib/ai/design/design-provider-contract"
import type { AiProvider } from "@/lib/ai/providers/types"
import type {
  GenerateArchitectureDraftInput,
  GenerateArchitectureDraftResult,
} from "@/lib/ai/architecture-draft/architecture-draft-provider-contract"
import {
  ARCHITECTURE_DRAFT_SCHEMA_URL,
  ARCHITECTURE_DRAFT_VERSION,
  parseArchitectureDraftProposal,
  type ArchitectureDraftEdge,
  type ArchitectureDraftGraph,
  type ArchitectureDraftNode,
  type ArchitectureDraftProposal,
} from "@/lib/architecture-draft/architecture-draft"
import type { SemanticEdgeType, SemanticNodeType } from "@/types/canvas"

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36)

  return slug || "architecture"
}

function getPromptTopic(prompt: string) {
  return prompt
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 4)
    .join(" ") || "system"
}

function uniqueId(baseId: string, existingIds: Set<string>) {
  let id = baseId
  let index = 2

  while (existingIds.has(id)) {
    id = `${baseId}-${index}`
    index++
  }

  existingIds.add(id)
  return id
}

function formatEdgeLabels(edge: GenerateSpecMarkdownInput["edges"][number]) {
  const labels =
    edge.data?.labels?.map((label) => label.trim()).filter(Boolean) ?? []
  if (labels.length > 0) return ` (${labels.join("; ")})`

  return edge.data?.label ? ` (${edge.data.label})` : ""
}

function draftNode(
  semanticType: SemanticNodeType | string,
  label: string,
  metadata: Record<string, unknown>,
  position: { x: number; y: number },
  description: string
): ArchitectureDraftNode {
  return {
    id: `${semanticType}-${slugify(label)}`,
    semanticType,
    label,
    name: label,
    description,
    metadata,
    position,
  }
}

function draftEdge(
  source: string,
  target: string,
  semanticType: SemanticEdgeType | string,
  label: string,
  metadata: Record<string, unknown> = {}
): ArchitectureDraftEdge {
  return {
    id: slugify(`edge-${source}-${target}-${semanticType}`).slice(0, 120),
    source,
    target,
    semanticType,
    label,
    labels: [label],
    metadata,
  }
}

function baseProposal(
  input: GenerateArchitectureDraftInput,
  title: string,
  summary: string,
  nodes: ArchitectureDraftNode[],
  edges: ArchitectureDraftEdge[],
  assumptions: string[],
  suggestedNextSteps: string[],
  graphs: ArchitectureDraftGraph[] = []
): ArchitectureDraftProposal {
  return {
    $schema: ARCHITECTURE_DRAFT_SCHEMA_URL,
    draftVersion: ARCHITECTURE_DRAFT_VERSION,
    status: "draft",
    title,
    summary,
    targetGraphId: input.graphId,
    complexity: input.complexity,
    nodes,
    edges,
    graphs,
    clarificationQuestions: [],
    assumptions,
    warnings: [],
    suggestedNextSteps,
  }
}

function serviceMetadata(framework = "nextjs-api") {
  return {
    serviceKind: "application-service",
    runtime: "node-typescript",
    language: "typescript",
    framework,
    tenancy: "owner-scoped-now-workspace-compatible-later",
    authMode: "internal-cookie-session",
  }
}

function databaseMetadata(engine = "postgresql") {
  return {
    dbKind: "relational",
    engine,
    orm: "prisma",
    schemaMode: "managed-migrations",
  }
}

function workerMetadata(triggerType = "event") {
  return {
    triggerType,
    retryPolicy: "exponential-backoff",
    idempotencyRequired: true,
  }
}

function authMetadata() {
  return {
    authStrategy: "internal-cookie-session",
    sessionMode: "httpOnly-cookie",
    emailVerification: true,
  }
}

function frontendMetadata(clientKind = "web-app") {
  return {
    clientKind,
    framework: "nextjs",
    authFlow: "cookie-session",
    routes: ["/", "/account"],
  }
}

function externalMetadata(vendorType = "payment-provider") {
  return {
    vendorType,
    authType: "secretRef",
    credentialRef: "secretRef:provider/api-key",
    rateLimit: "provider-defined",
  }
}

function policyMetadata(policyKind = "security") {
  return {
    policyKind,
    enforcementMode: "server-side",
    auditRequired: true,
  }
}

function taxiArchitecture(input: GenerateArchitectureDraftInput) {
  const nodes = [
    draftNode(
      "frontend",
      "Passenger App",
      frontendMetadata("web-mobile"),
      { x: 80, y: 80 },
      "Customer-facing booking and ride tracking experience."
    ),
    draftNode(
      "auth-module",
      "Session Auth",
      authMetadata(),
      { x: 320, y: 80 },
      "Owns account, session, and identity checks."
    ),
    draftNode(
      "service",
      "Booking Service",
      serviceMetadata("nextjs-api"),
      { x: 560, y: 80 },
      "Creates trips, prices rides, and coordinates booking state."
    ),
    draftNode(
      "service",
      "Dispatch Service",
      serviceMetadata("node-worker-api"),
      { x: 800, y: 80 },
      "Matches available drivers with active ride requests."
    ),
    draftNode(
      "worker",
      "Dispatch Worker",
      workerMetadata("event"),
      { x: 560, y: 260 },
      "Processes booking events and retries driver assignment safely."
    ),
    draftNode(
      "database",
      "Trip Database",
      databaseMetadata(),
      { x: 800, y: 260 },
      "Stores riders, drivers, bookings, trips, and payment references."
    ),
    draftNode(
      "external-system",
      "Payment Gateway",
      externalMetadata("payment-provider"),
      { x: 1040, y: 80 },
      "External provider for payment authorization and capture."
    ),
    draftNode(
      "policy",
      "Tenant Access Policy",
      policyMetadata("tenancy"),
      { x: 320, y: 260 },
      "Guards owner-scoped access now and future workspace tenancy."
    ),
  ]

  const byLabel = new Map(nodes.map((node) => [node.label, node.id]))
  const edges = [
    draftEdge(
      byLabel.get("Passenger App")!,
      byLabel.get("Session Auth")!,
      "auth-check",
      "session required",
      { authMode: "internal-cookie-session", requiredScopes: ["rides:write"] }
    ),
    draftEdge(
      byLabel.get("Passenger App")!,
      byLabel.get("Booking Service")!,
      "http-call",
      "POST /rides",
      { operationHint: "create ride booking", method: "POST", path: "/rides" }
    ),
    draftEdge(
      byLabel.get("Booking Service")!,
      byLabel.get("Trip Database")!,
      "db-write",
      "persist booking",
      { entityRefs: ["Ride", "Passenger"], transactionality: "required", idempotent: true }
    ),
    draftEdge(
      byLabel.get("Booking Service")!,
      byLabel.get("Dispatch Worker")!,
      "invokes-worker",
      "queue dispatch job",
      { triggerMode: "event", payloadRef: "RideRequested" }
    ),
    draftEdge(
      byLabel.get("Dispatch Worker")!,
      byLabel.get("Dispatch Service")!,
      "http-call",
      "assign driver",
      { operationHint: "assign nearest driver", method: "POST", path: "/dispatch/assign" }
    ),
    draftEdge(
      byLabel.get("Dispatch Service")!,
      byLabel.get("Trip Database")!,
      "db-read",
      "read driver availability",
      { entityRefs: ["Driver", "Ride"], consistency: "read-committed" }
    ),
    draftEdge(
      byLabel.get("Booking Service")!,
      byLabel.get("Payment Gateway")!,
      "http-call",
      "authorize payment",
      { operationHint: "authorize ride payment", method: "POST", path: "/payments/authorize" }
    ),
    draftEdge(
      byLabel.get("Tenant Access Policy")!,
      byLabel.get("Booking Service")!,
      "guards",
      "guards booking access",
      { enforcementPoint: "service", blocking: true }
    ),
  ]
  const backendNodeId = byLabel.get("Booking Service")!
  const childNodes = [
    draftNode(
      "module",
      "Booking Workflow Module",
      { moduleKind: "workflow", boundedContext: "booking" },
      { x: 80, y: 80 },
      "Coordinates ride request validation, pricing, booking creation, and dispatch handoff."
    ),
    draftNode(
      "endpoint-group",
      "Ride Booking API",
      { pathPrefix: "/rides", resourceName: "rides" },
      { x: 340, y: 80 },
      "HTTP surface for ride quote, create, cancel, and status operations."
    ),
    draftNode(
      "entity",
      "Ride Aggregate",
      { fields: ["id", "passengerId", "driverId", "status", "fare"], tenantKey: "ownerId" },
      { x: 600, y: 80 },
      "Core booking aggregate for the ride lifecycle."
    ),
    draftNode(
      "business-rule",
      "Fare and Dispatch Guard",
      { ruleType: "pricing-and-dispatch-policy" },
      { x: 340, y: 260 },
      "Keeps pricing and dispatch eligibility explicit inside the booking layer."
    ),
  ]
  const childIds = new Map(childNodes.map((node) => [node.label, node.id ?? node.label]))
  const childEdges = [
    draftEdge(
      childIds.get("Ride Booking API")!,
      childIds.get("Booking Workflow Module")!,
      "invokes",
      "routes commands to workflow"
    ),
    draftEdge(
      childIds.get("Booking Workflow Module")!,
      childIds.get("Ride Aggregate")!,
      "persists aggregate",
      "writes ride lifecycle state"
    ),
    draftEdge(
      childIds.get("Fare and Dispatch Guard")!,
      childIds.get("Booking Workflow Module")!,
      "guards",
      "guards booking decisions"
    ),
  ]

  return baseProposal(
    input,
    "Taxi Booking Architecture",
    "A root-level taxi booking system with passenger UI, session auth, booking and dispatch services, an async worker, durable trip storage, payment integration, and tenancy policy guardrails.",
    nodes,
    edges,
    [
      "Ride booking, dispatch, and payment authorization are separate responsibilities.",
      "Payment secrets stay outside CanvasDoc and are referenced through secretRef values.",
    ],
    [
      "Drill into Booking Service to define endpoints and entities.",
      "Add event contracts for RideRequested and DriverAssigned.",
    ],
    [
      {
        graphId: "graph_booking_service_internals",
        title: "Booking Service Internals",
        layer: input.graphId === "graph_root" ? 1 : undefined,
        layerKind: "service-internals",
        parentGraphId: input.graphId,
        parentNodeTempId: backendNodeId,
        summary: "Internal booking modules, API surface, aggregate, and guardrails.",
        nodes: childNodes,
        edges: childEdges,
      },
    ]
  )
}

function ecommerceArchitecture(input: GenerateArchitectureDraftInput) {
  const nodes = [
    draftNode("frontend", "Storefront", frontendMetadata(), { x: 80, y: 80 }, "Customer shopping experience."),
    draftNode("service", "Catalog Service", serviceMetadata(), { x: 320, y: 80 }, "Serves product and inventory data."),
    draftNode("service", "Checkout Service", serviceMetadata(), { x: 560, y: 80 }, "Owns cart checkout and order creation."),
    draftNode("database", "Commerce Database", databaseMetadata(), { x: 800, y: 80 }, "Stores products, carts, orders, and payment references."),
    draftNode("worker", "Fulfillment Worker", workerMetadata(), { x: 560, y: 260 }, "Processes paid orders for fulfillment."),
    draftNode("external-system", "Payment Gateway", externalMetadata(), { x: 800, y: 260 }, "External payment authorization provider."),
    draftNode("auth-module", "Customer Auth", authMetadata(), { x: 320, y: 260 }, "Authenticates customers and sessions."),
  ]
  const ids = new Map(nodes.map((node) => [node.label, node.id]))
  const edges = [
    draftEdge(ids.get("Storefront")!, ids.get("Customer Auth")!, "auth-check", "customer session"),
    draftEdge(ids.get("Storefront")!, ids.get("Catalog Service")!, "http-call", "GET /products", { operationHint: "list products", method: "GET", path: "/products" }),
    draftEdge(ids.get("Storefront")!, ids.get("Checkout Service")!, "http-call", "POST /checkout", { operationHint: "submit checkout", method: "POST", path: "/checkout" }),
    draftEdge(ids.get("Catalog Service")!, ids.get("Commerce Database")!, "db-read", "read catalog"),
    draftEdge(ids.get("Checkout Service")!, ids.get("Commerce Database")!, "db-write", "write order"),
    draftEdge(ids.get("Checkout Service")!, ids.get("Payment Gateway")!, "http-call", "authorize payment", { operationHint: "authorize payment", method: "POST", path: "/payments/authorize" }),
    draftEdge(ids.get("Checkout Service")!, ids.get("Fulfillment Worker")!, "invokes-worker", "fulfill order"),
  ]
  return baseProposal(
    input,
    "E-commerce Checkout Architecture",
    "A storefront architecture with catalog, checkout, commerce storage, payment integration, auth, and fulfillment processing.",
    nodes,
    edges,
    ["Checkout writes orders only after payment authorization succeeds."],
    ["Drill into Checkout Service to define cart, payment, and order endpoints."]
  )
}

function chatArchitecture(input: GenerateArchitectureDraftInput) {
  const nodes = [
    draftNode("frontend", "Chat Client", frontendMetadata(), { x: 80, y: 80 }, "Realtime chat client."),
    draftNode("service", "Messaging Service", serviceMetadata("websocket-api"), { x: 320, y: 80 }, "Owns message send, fetch, and room membership APIs."),
    draftNode("database", "Message Database", databaseMetadata(), { x: 560, y: 80 }, "Stores rooms, memberships, and messages."),
    draftNode("worker", "Notification Worker", workerMetadata("event"), { x: 320, y: 260 }, "Delivers async notifications."),
    draftNode("auth-module", "Chat Auth", authMetadata(), { x: 80, y: 260 }, "Protects rooms and sessions."),
    draftNode("policy", "Room Access Policy", policyMetadata("security"), { x: 560, y: 260 }, "Guards room membership and message visibility."),
  ]
  const ids = new Map(nodes.map((node) => [node.label, node.id]))
  const edges = [
    draftEdge(ids.get("Chat Client")!, ids.get("Chat Auth")!, "auth-check", "session check"),
    draftEdge(ids.get("Chat Client")!, ids.get("Messaging Service")!, "http-call", "POST /messages", { operationHint: "send message", method: "POST", path: "/messages" }),
    draftEdge(ids.get("Messaging Service")!, ids.get("Message Database")!, "db-write", "persist message"),
    draftEdge(ids.get("Messaging Service")!, ids.get("Notification Worker")!, "invokes-worker", "fan out notifications"),
    draftEdge(ids.get("Room Access Policy")!, ids.get("Messaging Service")!, "guards", "guard room access", { enforcementPoint: "service", blocking: true }),
  ]
  return baseProposal(
    input,
    "Realtime Chat Architecture",
    "A chat system with session auth, messaging service, message persistence, notification worker, and room access policy.",
    nodes,
    edges,
    ["Rooms are protected by membership checks before message access."],
    ["Add event contracts for MessageCreated and NotificationRequested."]
  )
}

function genericArchitecture(input: GenerateArchitectureDraftInput) {
  const topic = getPromptTopic(input.prompt)
  const nodes = [
    draftNode("frontend", `${topic} Console`, frontendMetadata(), { x: 80, y: 80 }, "User-facing product surface."),
    draftNode("auth-module", `${topic} Auth`, authMetadata(), { x: 320, y: 80 }, "Session and access boundary."),
    draftNode("service", `${topic} Service`, serviceMetadata(), { x: 560, y: 80 }, "Primary application service."),
    draftNode("database", `${topic} Database`, databaseMetadata(), { x: 800, y: 80 }, "Durable application data store."),
    draftNode("worker", `${topic} Worker`, workerMetadata(), { x: 560, y: 260 }, "Async background processor."),
  ]
  const ids = new Map(nodes.map((node) => [node.label, node.id]))
  const edges = [
    draftEdge(ids.get(`${topic} Console`)!, ids.get(`${topic} Auth`)!, "auth-check", "session check"),
    draftEdge(ids.get(`${topic} Console`)!, ids.get(`${topic} Service`)!, "http-call", "POST /actions", { operationHint: "submit action", method: "POST", path: "/actions" }),
    draftEdge(ids.get(`${topic} Service`)!, ids.get(`${topic} Database`)!, "db-write", "persist state"),
    draftEdge(ids.get(`${topic} Service`)!, ids.get(`${topic} Worker`)!, "invokes-worker", "process async work"),
  ]
  return baseProposal(
    input,
    `${topic} Architecture`,
    `A compact semantic root architecture for ${topic} with frontend, auth, service, database, and async worker responsibilities.`,
    nodes,
    edges,
    ["The draft is intentionally root-level; service internals can be modeled in drill-down canvases."],
    ["Fill service internals with endpoints, entities, workers, events, validations, and policies."]
  )
}

function architectureForPrompt(input: GenerateArchitectureDraftInput) {
  const prompt = input.prompt.toLowerCase()
  if (/(taxi|ride|rideshare|booking|dispatch|driver|payment)/.test(prompt)) {
    return taxiArchitecture(input)
  }
  if (/(shop|store|commerce|e-?commerce|checkout|cart|catalog|order)/.test(prompt)) {
    return ecommerceArchitecture(input)
  }
  if (/(chat|message|messaging|room|conversation)/.test(prompt)) {
    return chatArchitecture(input)
  }
  return genericArchitecture(input)
}

export class MockAiProvider implements AiProvider {
  readonly name = "mock" as const

  async generateDesignActions(
    input: GenerateDesignActionsInput
  ): Promise<GenerateDesignActionsResult> {
    const topic = getPromptTopic(input.prompt)
    const slug = slugify(topic)
    const existingIds = new Set([
      ...input.currentCanvas.nodes.map((node) => node.id),
      ...input.currentCanvas.edges.map((edge) => edge.id),
    ])

    const clientId = uniqueId(`${slug}-client`, existingIds)
    const serviceId = uniqueId(`${slug}-service`, existingIds)
    const dataId = uniqueId(`${slug}-data-store`, existingIds)
    const clientToServiceId = uniqueId(`edge-${clientId}-${serviceId}`, existingIds)
    const serviceToDataId = uniqueId(`edge-${serviceId}-${dataId}`, existingIds)

    const rowOffset = Math.floor(input.currentCanvas.nodes.length / 3) * 180
    const actions: DesignAction[] = [
      {
        type: "addNode",
        id: clientId,
        label: `${topic} Client`,
        shape: "circle",
        colorIndex: 5,
        x: 100,
        y: 80 + rowOffset,
      },
      {
        type: "addNode",
        id: serviceId,
        label: `${topic} Service`,
        shape: "rectangle",
        colorIndex: 1,
        x: 360,
        y: 90 + rowOffset,
      },
      {
        type: "addNode",
        id: dataId,
        label: `${topic} Data Store`,
        shape: "cylinder",
        colorIndex: 7,
        x: 620,
        y: 80 + rowOffset,
      },
      {
        type: "addEdge",
        id: clientToServiceId,
        source: clientId,
        target: serviceId,
        label: "requests",
      },
      {
        type: "addEdge",
        id: serviceToDataId,
        source: serviceId,
        target: dataId,
        label: "persists",
      },
    ]

    return validateDesignProviderResult({
      actions,
      summary: `Mock AI generated a deterministic ${topic} architecture with a client, service, and data store.`,
    })
  }

  async generateSpecMarkdown(input: GenerateSpecMarkdownInput): Promise<string> {
    const context = buildSpecContext(input.nodes, input.edges, input.chatHistory)
    const nodeCount = input.nodes.length
    const edgeCount = input.edges.length
    const primaryNodes = input.nodes
      .slice(0, 8)
      .map((node) => `- ${node.data?.label ?? node.id}`)
      .join("\n")

    return [
      "# Technical Specification",
      "",
      "## Overview",
      `This deterministic mock specification summarizes project \`${input.projectId}\` for local development and smoke testing without external AI keys.`,
      "",
      "## Architecture",
      `The current canvas contains ${nodeCount} node${nodeCount === 1 ? "" : "s"} and ${edgeCount} connection${edgeCount === 1 ? "" : "s"}.`,
      "",
      "## Components",
      primaryNodes || "- No canvas components were provided.",
      "",
      "## Data Flow",
      input.edges.length
        ? input.edges
            .slice(0, 12)
            .map((edge) => `- ${edge.source} -> ${edge.target}${formatEdgeLabels(edge)}`)
            .join("\n")
        : "- No connections were provided.",
      "",
      "## Conversation Context",
      input.chatHistory.length
        ? input.chatHistory.map((message) => `- **${message.role}**: ${message.content}`).join("\n")
        : "- No chat history was provided.",
      "",
      "## Provider Context",
      "```text",
      context,
      "```",
      "",
    ].join("\n")
  }

  async generateArchitectureDraft(
    input: GenerateArchitectureDraftInput
  ): Promise<GenerateArchitectureDraftResult> {
    return parseArchitectureDraftProposal(architectureForPrompt(input))
  }
}
