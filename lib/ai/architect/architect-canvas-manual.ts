import {
  EDGE_RELATIONSHIP_TYPES,
  SEMANTIC_EDGE_DEFINITIONS,
  SEMANTIC_NODE_DEFINITIONS,
  SEMANTIC_NODE_TYPES,
} from "@/types/canvas"

interface CanvasFieldGuide {
  field: string
  valueShape: string
  meaning: string
  useWhen: string
}

interface CanvasOperationGuide {
  op: string
  useFor: string
  targetRules: string[]
  payloadRules: string[]
}

interface SemanticRepairGuide {
  findingPattern: string
  target: "node" | "edge" | "canvas"
  repairWith: string[]
}

const NODE_DURABLE_FIELDS = [
  "label",
  "semanticType",
  "name",
  "description",
  "responsibilities",
  "tags",
  "status",
  "maturity",
  "sourceRefs",
  "assumptions",
  "decisionRefs",
  "owner",
  "boundary",
  "trustZone",
  "exposure",
  "dataSensitivity",
  "authExpectation",
  "layerRole",
  "interfacesExposed",
  "interfacesConsumed",
  "dataOwned",
  "dataRead",
  "eventsEmitted",
  "eventsConsumed",
  "technology",
  "runtimeKind",
  "securityNotes",
  "privacyClass",
  "operationalNotes",
  "scalingNotes",
  "observabilityNotes",
  "failureModes",
  "signalTypes",
  "openQuestions",
  "promptPackNotes",
  "trustNotes",
  "interfaceNotes",
  "eventNotes",
  "retentionNotes",
  "incidentNotes",
  "backupNotes",
  "secretRef",
  "secretCapabilityRef",
  "environment",
  "region",
  "aiRole",
  "modelProvider",
  "modelClass",
  "toolAccess",
  "safetyNotes",
  "retrievalNotes",
  "costNotes",
  "referenceKind",
  "referencedGraphId",
  "referencedNodeId",
  "referencedEdgeId",
  "referencedLabel",
  "referenceRole",
  "proxyDirection",
  "referenceNotes",
  "hasChildLayer",
  "childLayerPurpose",
  "childLayerSummary",
  "decompositionStatus",
  "lastLayerSummary",
  "childLayerUpdatedAt",
  "createdAt",
  "updatedAt",
  "subcanvasRef",
  "color",
  "textColor",
  "shape",
  "serviceKind",
  "runtime",
  "language",
  "framework",
  "tenancy",
  "authMode",
  "dbKind",
  "engine",
  "orm",
  "triggerType",
  "retryPolicy",
  "idempotencyRequired",
  "authStrategy",
  "sessionMode",
  "emailVerification",
  "method",
  "path",
  "authRequired",
  "idempotent",
  "fields",
  "tenantKey",
  "direction",
  "topic",
  "deliveryGuarantee",
  "ruleType",
  "validationScope",
  "severity",
  "policyKind",
  "enforcementMode",
  "auditRequired",
  "architectureType",
  "llmSemanticType",
  "originalSemanticType",
] as const

const EDGE_DURABLE_FIELDS = [
  "semanticType",
  "relationshipType",
  "name",
  "label",
  "labels",
  "labelItems",
  "description",
  "tags",
  "status",
  "sourceRefs",
  "assumptions",
  "decisionRefs",
  "owner",
  "createdAt",
  "updatedAt",
  "operationHint",
  "operationName",
  "mechanism",
  "protocol",
  "dataSubject",
  "eventSubject",
  "syncMode",
  "criticality",
  "directionality",
  "reliability",
  "securityNotes",
  "trustNotes",
  "method",
  "path",
  "auth",
  "timeoutMs",
  "retryPolicy",
  "idempotencyNotes",
  "consistency",
  "rateLimitNotes",
  "timeoutNotes",
  "fallbackNotes",
  "ownershipNotes",
  "eventName",
  "topic",
  "architectureType",
  "llmSemanticType",
  "originalSemanticType",
] as const

const NODE_FIELD_GUIDE: CanvasFieldGuide[] = [
  {
    field: "semanticType",
    valueShape: "one Canvas semantic node type string",
    meaning: "The node's architecture role. This drives badges, defaults, summaries, and semantic scan interpretation.",
    useWhen: "A node is unclassified, mislabeled, or should become service, worker, database, actor, client-surface, event-channel, external-system, identity-auth, generic-component, or an internal detail type.",
  },
  {
    field: "name",
    valueShape: "short string",
    meaning: "Canonical human-readable node name used in inspector summaries and Prompt Pack references.",
    useWhen: "The label is vague, duplicated, truncated, or the node needs a precise architecture name.",
  },
  {
    field: "label",
    valueShape: "short string",
    meaning: "Visible canvas label.",
    useWhen: "The on-canvas text needs to match the architecture concept.",
  },
  {
    field: "description",
    valueShape: "1-3 sentence string",
    meaning: "What this node owns or represents in the architecture.",
    useWhen: "Semantic Scan says the node is missing a description or when handoff context is weak.",
  },
  {
    field: "responsibilities",
    valueShape: "string array",
    meaning: "Concrete duties this node owns. Prefer implementation-relevant responsibilities, not generic slogans.",
    useWhen: "A node is missing responsibilities, has unclear ownership, or needs stronger Prompt Pack instructions.",
  },
  {
    field: "owner",
    valueShape: "string or null",
    meaning: "Owning team, module, bounded context, or service owner.",
    useWhen: "Semantic Scan asks for ownership, especially databases, stateful stores, runtime units, and external integrations.",
  },
  {
    field: "boundary",
    valueShape: "string",
    meaning: "Business, trust, tenancy, or deployment boundary name.",
    useWhen: "The node crosses or defines a system boundary.",
  },
  {
    field: "trustZone",
    valueShape: "string",
    meaning: "Trust/security zone such as public, edge, internal, private, provider, regulated, or admin.",
    useWhen: "Security, auth, provider, AI, or data-sensitivity assumptions matter.",
  },
  {
    field: "exposure",
    valueShape: "private | internal | partner | public | unknown",
    meaning: "How exposed the node is to users, partners, or the internet.",
    useWhen: "Client surfaces, APIs, external integrations, and auth/security warnings need clarity.",
  },
  {
    field: "dataSensitivity",
    valueShape: "public | internal | confidential | restricted | regulated | unknown",
    meaning: "Sensitivity of data owned or handled by the node.",
    useWhen: "The node stores or processes personal, tenant, payment, regulated, secret, or operational data.",
  },
  {
    field: "authExpectation",
    valueShape: "string",
    meaning: "Authentication or authorization expectation in plain architecture language.",
    useWhen: "A public or protected surface lacks auth/security context.",
  },
  {
    field: "layerRole",
    valueShape: "string",
    meaning: "Role of the node inside its current layer, such as application-service, state-store, ingress, adapter, policy, or worker.",
    useWhen: "The node needs clearer placement inside the layer.",
  },
  {
    field: "status",
    valueShape: "draft | approved | deprecated",
    meaning: "Review state for the architecture item.",
    useWhen: "The user asks to mark something approved/deprecated or clarify maturity.",
  },
  {
    field: "maturity",
    valueShape: "draft | approved | deprecated or custom string",
    meaning: "Maturity of the architecture decision or node detail.",
    useWhen: "The user wants rough/confirmed/deprecated status beyond basic status.",
  },
  {
    field: "tags",
    valueShape: "string array",
    meaning: "Search/grouping tags.",
    useWhen: "The node needs domain, risk, team, platform, or feature grouping.",
  },
  {
    field: "interfacesExposed",
    valueShape: "string array",
    meaning: "APIs, endpoints, events, SDKs, ports, contracts, or UI surfaces exposed by the node.",
    useWhen: "A service/client/API needs its outward contract clarified.",
  },
  {
    field: "interfacesConsumed",
    valueShape: "string array",
    meaning: "APIs, events, stores, providers, or contracts consumed by the node.",
    useWhen: "Dependencies or inputs are unclear.",
  },
  {
    field: "interfaceNotes",
    valueShape: "string",
    meaning: "Freeform notes about interface shape, compatibility, versioning, or ownership.",
    useWhen: "Interfaces need nuance that does not fit a short list.",
  },
  {
    field: "dataOwned",
    valueShape: "string array",
    meaning: "Data entities or artifacts owned by the node.",
    useWhen: "State ownership, database, cache, object-store, or domain model warnings need repair.",
  },
  {
    field: "dataRead",
    valueShape: "string array",
    meaning: "Data entities or artifacts read by the node but not owned by it.",
    useWhen: "Read dependencies need handoff clarity.",
  },
  {
    field: "privacyClass",
    valueShape: "string",
    meaning: "Privacy classification such as PII, tenant data, payment metadata, audit, internal, or public.",
    useWhen: "Sensitive data needs privacy/security context.",
  },
  {
    field: "retentionNotes",
    valueShape: "string",
    meaning: "Retention, TTL, archival, or deletion expectations.",
    useWhen: "Stores, logs, queues, events, objects, and compliance-sensitive data need retention clarity.",
  },
  {
    field: "backupNotes",
    valueShape: "string",
    meaning: "Backup, restore, durability, or recovery expectations.",
    useWhen: "Stateful stores need resilience details.",
  },
  {
    field: "eventsEmitted",
    valueShape: "string array",
    meaning: "Events, commands, or messages emitted by the node.",
    useWhen: "Async flow, event-channel, worker, and integration handoff needs clarity.",
  },
  {
    field: "eventsConsumed",
    valueShape: "string array",
    meaning: "Events, commands, or messages consumed by the node.",
    useWhen: "Consumers, workers, queues, and event contracts need clarity.",
  },
  {
    field: "eventNotes",
    valueShape: "string",
    meaning: "Notes about event contracts, ordering, delivery, schema, or compatibility.",
    useWhen: "Async behavior cannot be captured by event names alone.",
  },
  {
    field: "securityNotes",
    valueShape: "string",
    meaning: "Security assumptions, controls, scopes, token handling, validation, or threat notes.",
    useWhen: "Security integration, trust boundary, auth, AI governance, public exposure, or external provider warnings need repair.",
  },
  {
    field: "trustNotes",
    valueShape: "string",
    meaning: "Trust assumptions between zones, providers, users, tenants, or layers.",
    useWhen: "Boundary-crossing or external provider interactions need explicit assumptions.",
  },
  {
    field: "safetyNotes",
    valueShape: "string",
    meaning: "Safety, guardrail, misuse, moderation, or tool-access constraints.",
    useWhen: "AI-like components or user-impacting automation need governance detail.",
  },
  {
    field: "secretRef",
    valueShape: "string reference only",
    meaning: "Reference to a secret managed elsewhere. Never put raw secret values here.",
    useWhen: "A component needs a credential reference.",
  },
  {
    field: "secretCapabilityRef",
    valueShape: "string reference only",
    meaning: "Reference to a capability or permission set managed outside the canvas.",
    useWhen: "A component needs to describe allowed secret-backed capabilities.",
  },
  {
    field: "technology",
    valueShape: "string",
    meaning: "Important implementation technology, library, platform, or product choice.",
    useWhen: "The architecture needs handoff-relevant tech detail.",
  },
  {
    field: "runtimeKind",
    valueShape: "string",
    meaning: "Runtime/deployment kind such as container, serverless function, cron worker, queue consumer, managed database, or SaaS.",
    useWhen: "Runtime / Deployment Unit or runs_on warnings need repair.",
  },
  {
    field: "environment",
    valueShape: "string",
    meaning: "Deployment environment such as prod, staging, edge, worker, browser, mobile, or provider.",
    useWhen: "Deployment placement matters.",
  },
  {
    field: "region",
    valueShape: "string",
    meaning: "Region, locality, or data residency hint.",
    useWhen: "Latency, compliance, failover, or provider location matters.",
  },
  {
    field: "operationalNotes",
    valueShape: "string",
    meaning: "Operations, runbook, retry, invalidation, deployment, maintenance, or ownership notes.",
    useWhen: "Runtime, cache, worker, monitors, or operability warnings need repair.",
  },
  {
    field: "scalingNotes",
    valueShape: "string",
    meaning: "Scale strategy, bottlenecks, partitioning, pooling, fanout, or throughput notes.",
    useWhen: "The node needs capacity or scaling context.",
  },
  {
    field: "observabilityNotes",
    valueShape: "string",
    meaning: "Metrics, logs, traces, dashboards, alerts, audit, or health check notes.",
    useWhen: "Observability or monitoring warnings need repair.",
  },
  {
    field: "signalTypes",
    valueShape: "string array",
    meaning: "Operational signals captured or emitted: metrics, logs, traces, audit events, alerts, SLOs.",
    useWhen: "Observability / Control Plane needs signal detail.",
  },
  {
    field: "incidentNotes",
    valueShape: "string",
    meaning: "Incident response, escalation, detection, or failure handling notes.",
    useWhen: "Operational readiness or control-plane details matter.",
  },
  {
    field: "failureModes",
    valueShape: "string array",
    meaning: "Known ways this component can fail.",
    useWhen: "Reliability or handoff quality needs failure awareness.",
  },
  {
    field: "aiRole",
    valueShape: "string",
    meaning: "The role of an AI component: planner, classifier, retriever, tool caller, summarizer, guardrail, etc.",
    useWhen: "The node is an AI component or agent-like system.",
  },
  {
    field: "modelProvider",
    valueShape: "string",
    meaning: "Provider or model family for an AI component, if known.",
    useWhen: "AI provider choice matters and is not a secret.",
  },
  {
    field: "modelClass",
    valueShape: "string",
    meaning: "Model class such as chat, embedding, reranker, vision, moderation, or local model.",
    useWhen: "AI architecture needs model-type clarity.",
  },
  {
    field: "toolAccess",
    valueShape: "string array",
    meaning: "Tools or capabilities an AI component may call.",
    useWhen: "AI governance, safety, or tool boundaries need clarity.",
  },
  {
    field: "retrievalNotes",
    valueShape: "string",
    meaning: "Retrieval/RAG sources, indexes, filters, freshness, or grounding assumptions.",
    useWhen: "AI component uses retrieval or knowledge context.",
  },
  {
    field: "costNotes",
    valueShape: "string",
    meaning: "Cost, quota, budget, caching, fallback, or rate limits for AI/runtime/provider use.",
    useWhen: "Provider or AI cost constraints matter.",
  },
  {
    field: "referenceKind",
    valueShape: "node | edge | graph or custom string",
    meaning: "What a reference-proxy points at.",
    useWhen: "Creating or repairing a cross-layer reference proxy.",
  },
  {
    field: "referencedGraphId",
    valueShape: "existing graph id string",
    meaning: "Graph that owns the referenced thing.",
    useWhen: "A reference-proxy needs to point to another layer.",
  },
  {
    field: "referencedNodeId",
    valueShape: "existing node id string",
    meaning: "Node owned in another graph.",
    useWhen: "A reference-proxy points at a node.",
  },
  {
    field: "referencedEdgeId",
    valueShape: "existing edge id string",
    meaning: "Edge owned in another graph.",
    useWhen: "A reference-proxy points at a relationship.",
  },
  {
    field: "referencedLabel",
    valueShape: "string",
    meaning: "Readable label for the referenced target.",
    useWhen: "A proxy needs readable context without duplicating ownership.",
  },
  {
    field: "referenceRole",
    valueShape: "string",
    meaning: "Why the referenced item matters in the current layer.",
    useWhen: "A proxy needs architecture meaning.",
  },
  {
    field: "proxyDirection",
    valueShape: "inbound | outbound | bidirectional | context or custom string",
    meaning: "Direction of the reference from the local layer perspective.",
    useWhen: "A proxy should communicate flow or context direction.",
  },
  {
    field: "referenceNotes",
    valueShape: "string",
    meaning: "Notes for cross-layer ownership and reference semantics.",
    useWhen: "A proxy needs nuance.",
  },
  {
    field: "promptPackNotes",
    valueShape: "string",
    meaning: "Instructions or reminders that should influence the generated Prompt Pack.",
    useWhen: "The user gives implementation guidance, constraints, or handoff notes.",
  },
  {
    field: "sourceRefs",
    valueShape: "string array",
    meaning: "Source references, docs, tickets, ADRs, or evidence IDs.",
    useWhen: "A decision needs provenance.",
  },
  {
    field: "assumptions",
    valueShape: "string array",
    meaning: "Assumptions behind this node's design.",
    useWhen: "The architecture depends on unknowns or user-provided assumptions.",
  },
  {
    field: "decisionRefs",
    valueShape: "string array",
    meaning: "ADR, decision, or requirement identifiers.",
    useWhen: "A node should link to design decisions.",
  },
  {
    field: "openQuestions",
    valueShape: "string array",
    meaning: "Questions that remain unresolved for this node.",
    useWhen: "You need to preserve uncertainty instead of inventing facts.",
  },
  {
    field: "childLayerPurpose",
    valueShape: "string",
    meaning: "Why this node has or needs an inner architecture layer.",
    useWhen: "A node has internals or should explain planned internals.",
  },
  {
    field: "childLayerSummary",
    valueShape: "string",
    meaning: "Parent-visible factual summary of the child layer.",
    useWhen: "The child layer was created or populated and the parent should summarize it.",
  },
  {
    field: "lastLayerSummary",
    valueShape: "string",
    meaning: "Last factual child-layer summary cache.",
    useWhen: "The child layer state changed.",
  },
  {
    field: "decompositionStatus",
    valueShape: "none | planned | partial | complete | stale",
    meaning: "State of this node's child-layer decomposition.",
    useWhen: "Layer internals are planned, partial, complete, or stale.",
  },
  {
    field: "subcanvasRef, hasChildLayer, childLayerUpdatedAt",
    valueShape: "object, boolean, or timestamp string",
    meaning: "Durable child-layer reference/status fields.",
    useWhen: "Usually create or reuse these through create-layer. Patch directly only when repairing known stale metadata from current CanvasDoc facts.",
  },
  {
    field: "color, textColor, shape",
    valueShape: "color strings or Canvas shape string",
    meaning: "Durable visual presentation fields for the canvas node.",
    useWhen: "The user asks for visual cleanup, readability, or shape/color alignment. These fields do not replace semanticType.",
  },
  {
    field: "createdAt, updatedAt",
    valueShape: "timestamp strings",
    meaning: "Durable timestamps when present in CanvasDoc.",
    useWhen: "Preserve existing values unless the user explicitly asks to repair timestamp metadata.",
  },
  {
    field: "serviceKind, runtime, language, framework, tenancy, authMode",
    valueShape: "strings",
    meaning: "Service-specific implementation context.",
    useWhen: "A service node needs richer handoff detail.",
  },
  {
    field: "dbKind, engine, orm",
    valueShape: "strings",
    meaning: "Database/store-specific technology context.",
    useWhen: "A database, cache, or object store needs storage detail.",
  },
  {
    field: "triggerType, retryPolicy, idempotencyRequired",
    valueShape: "strings or boolean",
    meaning: "Worker/job triggering and safety behavior.",
    useWhen: "A worker or async consumer needs retry/idempotency detail.",
  },
  {
    field: "authStrategy, sessionMode, emailVerification",
    valueShape: "strings or boolean",
    meaning: "Identity/auth module behavior.",
    useWhen: "An identity/auth node needs auth flow detail.",
  },
  {
    field: "method, path, authRequired, idempotent",
    valueShape: "strings or booleans",
    meaning: "Endpoint/API operation detail.",
    useWhen: "A child-layer API or endpoint node needs request semantics.",
  },
  {
    field: "fields, tenantKey",
    valueShape: "string array or string",
    meaning: "Entity/domain model fields and tenancy key.",
    useWhen: "Entity or domain-model nodes need data shape detail.",
  },
  {
    field: "direction, topic, deliveryGuarantee",
    valueShape: "strings",
    meaning: "Event contract direction, topic, and delivery behavior.",
    useWhen: "Event-contract or event-channel detail needs clarity.",
  },
  {
    field: "ruleType, validationScope, severity, policyKind, enforcementMode, auditRequired",
    valueShape: "strings or boolean",
    meaning: "Business rule, validation rule, and policy details.",
    useWhen: "Internal rule/policy layers need exact handoff detail.",
  },
]

const EDGE_FIELD_GUIDE: CanvasFieldGuide[] = [
  {
    field: "relationshipType",
    valueShape: "one Canvas relationship type string",
    meaning: "The relationship's technical meaning. Mirror to semanticType for compatibility.",
    useWhen: "An edge is untyped, mislabeled, or semantically wrong.",
  },
  {
    field: "labelItems",
    valueShape: "array of { id, text }",
    meaning: "Internal multi-label representation mirrored from label/labels.",
    useWhen: "Prefer patch.label or patch.labels; Arc Forge mirrors labelItems automatically.",
  },
  {
    field: "createdAt, updatedAt",
    valueShape: "timestamp strings",
    meaning: "Durable timestamps when present in CanvasDoc.",
    useWhen: "Preserve existing values unless the user explicitly asks to repair timestamp metadata.",
  },
  {
    field: "semanticType",
    valueShape: "same as relationshipType for modern relationships",
    meaning: "Compatibility semantic edge type.",
    useWhen: "Set it together with relationshipType on update-edge.",
  },
  {
    field: "label",
    valueShape: "short concrete string",
    meaning: "Primary visible edge label.",
    useWhen: "The edge lacks a label or has vague text like uses/connects/link.",
  },
  {
    field: "labels",
    valueShape: "string array",
    meaning: "Additional visible edge labels.",
    useWhen: "A relationship needs multiple concise operation/event/data hints.",
  },
  {
    field: "name",
    valueShape: "short string",
    meaning: "Canonical relationship name.",
    useWhen: "The edge needs a stable reference for handoff.",
  },
  {
    field: "description",
    valueShape: "string",
    meaning: "Relationship explanation.",
    useWhen: "A label is not enough to explain the relationship.",
  },
  {
    field: "mechanism",
    valueShape: "string",
    meaning: "Mechanism such as REST, GraphQL, gRPC, SQL, queue publish, stream consume, webhook, SDK, cron, or batch.",
    useWhen: "Calls, monitors, triggers, or integrations need concrete mechanics.",
  },
  {
    field: "protocol",
    valueShape: "string",
    meaning: "Transport protocol such as HTTPS, WebSocket, TCP, AMQP, Kafka protocol, SQL, or local call.",
    useWhen: "Calls or data flow need transport clarity.",
  },
  {
    field: "syncMode",
    valueShape: "sync | async | unknown",
    meaning: "Whether the relationship is synchronous or asynchronous.",
    useWhen: "Request/response, messaging, or eventual consistency needs clarity.",
  },
  {
    field: "method",
    valueShape: "string",
    meaning: "HTTP/RPC method or operation verb.",
    useWhen: "API/provider calls need request detail.",
  },
  {
    field: "path",
    valueShape: "string",
    meaning: "API path, resource, topic path, or operation path.",
    useWhen: "API/provider calls need endpoint detail.",
  },
  {
    field: "operationHint",
    valueShape: "string",
    meaning: "Concrete operation name or intent.",
    useWhen: "The relationship label needs implementation handoff detail.",
  },
  {
    field: "criticality",
    valueShape: "low | medium | high | critical or custom string",
    meaning: "How important the relationship is for the system.",
    useWhen: "Reliability, fallback, or dependency importance matters.",
  },
  {
    field: "directionality",
    valueShape: "directed | bidirectional | inferred or custom string",
    meaning: "Whether flow direction is intentional.",
    useWhen: "An edge is bidirectional or inferred rather than a normal directed flow.",
  },
  {
    field: "reliability",
    valueShape: "string",
    meaning: "Reliability expectations such as at-least-once, best-effort, durable, idempotent, retried, or monitored.",
    useWhen: "Async, runtime, monitor, and critical relationships need resilience detail.",
  },
  {
    field: "retryPolicy",
    valueShape: "string",
    meaning: "Retry/backoff/dead-letter behavior.",
    useWhen: "Async consumers, workers, webhooks, or provider calls need safe retry detail.",
  },
  {
    field: "idempotencyNotes",
    valueShape: "string",
    meaning: "How duplicate calls/messages are made safe.",
    useWhen: "Retries, writes, payments, workers, event consumers, or webhooks are present.",
  },
  {
    field: "consistency",
    valueShape: "string",
    meaning: "Consistency assumption such as strong, eventual, transactional, read-your-writes, or cache-stale.",
    useWhen: "Reads/writes/sync relationships need data consistency detail.",
  },
  {
    field: "rateLimitNotes",
    valueShape: "string",
    meaning: "Rate-limit, quota, throttle, or backpressure assumptions.",
    useWhen: "External providers, APIs, and bursty async flows need constraints.",
  },
  {
    field: "timeoutNotes",
    valueShape: "string",
    meaning: "Timeout and cancellation expectations.",
    useWhen: "Calls, provider integrations, and critical flows need failure bounds.",
  },
  {
    field: "fallbackNotes",
    valueShape: "string",
    meaning: "Fallback/degradation behavior.",
    useWhen: "Critical dependencies or provider failures need safe behavior.",
  },
  {
    field: "ownershipNotes",
    valueShape: "string",
    meaning: "Who owns or operates the relationship/contract.",
    useWhen: "Contract ownership or integration responsibility matters.",
  },
  {
    field: "dataSubject",
    valueShape: "string",
    meaning: "Data entity or artifact being read/written/synced.",
    useWhen: "Reads, writes, or syncs_with warnings need repair.",
  },
  {
    field: "eventSubject",
    valueShape: "string",
    meaning: "Event/command/message subject.",
    useWhen: "Publishes/consumes event warnings need repair.",
  },
  {
    field: "eventName",
    valueShape: "string",
    meaning: "Specific event name.",
    useWhen: "Event flow needs a concrete event contract.",
  },
  {
    field: "topic",
    valueShape: "string",
    meaning: "Topic, queue, stream, or channel name.",
    useWhen: "Async relationships need messaging destination detail.",
  },
  {
    field: "auth",
    valueShape: "string",
    meaning: "Auth mode or scope for the relationship.",
    useWhen: "Authentication, provider, or secure calls need access detail.",
  },
  {
    field: "securityNotes",
    valueShape: "string",
    meaning: "Security assumptions for the relationship.",
    useWhen: "Auth, boundary crossing, external provider, public call, or AI-provider links need repair.",
  },
  {
    field: "trustNotes",
    valueShape: "string",
    meaning: "Trust assumptions between endpoints or layers.",
    useWhen: "Boundary or external trust warnings need repair.",
  },
  {
    field: "status, tags, sourceRefs, assumptions, decisionRefs, owner",
    valueShape: "strings, arrays, or null",
    meaning: "Review/provenance/ownership metadata for the relationship.",
    useWhen: "The relationship needs lifecycle, provenance, or accountability detail.",
  },
]

const OPERATION_GUIDE: CanvasOperationGuide[] = [
  {
    op: "update-node",
    useFor: "Edit any durable field on any existing node in any graph.",
    targetRules: [
      "Use graphId from canvasPyramid/llmContextPyramid exactly.",
      "Use nodeId from an existing node in that graph exactly.",
      "Works for every semantic type and custom/generic node. There is no node-type permission gate.",
    ],
    payloadRules: [
      "Put inspector fields directly under patch, for example patch.description, patch.responsibilities, patch.owner, patch.securityNotes.",
      "If fields are nested under patch.metadata, Arc Forge merges them into the node data too; direct fields are preferred.",
      "Patch must change at least one durable field. Empty or no-op patches are rejected.",
      "Any durable CanvasNode.data field is allowed unless it is raw-secret-like or transient UI state.",
    ],
  },
  {
    op: "update-edge",
    useFor: "Edit any durable field on any existing relationship in any graph.",
    targetRules: [
      "Use graphId from canvasPyramid/llmContextPyramid exactly.",
      "Use edgeId from an existing edge in that graph exactly.",
      "Works for every relationship type and custom relationship metadata.",
    ],
    payloadRules: [
      "Put fields directly under patch, for example patch.relationshipType, patch.semanticType, patch.label, patch.labels, patch.dataSubject, patch.eventSubject, patch.securityNotes.",
      "When setting relationshipType, also set semanticType to the same value for compatibility.",
      "If fields are nested under patch.metadata, Arc Forge merges them into edge data too; direct fields are preferred.",
      "Patch must change at least one durable field. Empty or no-op patches are rejected.",
      "Any durable CanvasEdge.data field is allowed unless it is raw-secret-like or transient UI state.",
    ],
  },
  {
    op: "add-node",
    useFor: "Create any kind of node in any existing graph/layer.",
    targetRules: [
      "Use an existing graphId exactly.",
      "Use tempId when later operations in the same proposal need to reference the new node.",
      "You may add root-level architecture nodes or child-layer internal detail nodes in any graph.",
    ],
    payloadRules: [
      "node.label is required and becomes the visible label.",
      "Use node.semanticType when the type exists. For a custom architecture concept, use semanticType generic-component and add metadata.architectureType / metadata.llmSemanticType.",
      "Use node.metadata for durable inspector fields such as responsibilities, owner, interfaces, data, events, security, operations, Prompt Pack notes, and custom fields.",
      "Do not include raw secrets or transient UI state.",
    ],
  },
  {
    op: "add-edge",
    useFor: "Create a relationship between existing nodes or tempId-created nodes in the same graph.",
    targetRules: [
      "Use an existing graphId exactly.",
      "source and target must be existing node ids or tempIds created earlier in the same graph.",
    ],
    payloadRules: [
      "edge.relationshipType should be one of the relationship types. Also set edge.semanticType or metadata.semanticType when useful for compatibility.",
      "edge.label should be concrete: operation, data subject, event, auth dependency, runtime dependency, etc.",
      "Use edge.metadata for durable relationship fields such as mechanism, protocol, dataSubject, eventSubject, retryPolicy, securityNotes, trustNotes, and custom fields.",
    ],
  },
  {
    op: "create-layer",
    useFor: "Create or reuse a child architecture layer for any node type, then optionally populate it.",
    targetRules: [
      "Use parentGraphId and parentNodeId from the existing canvas exactly.",
      "Every node can have a child layer. Do not treat semantic type, shape, actor/generic/custom status, or unknown type as a restriction.",
      "If the selected node already has subcanvasRef, Arc Forge reuses that child graph and can populate it.",
    ],
    payloadRules: [
      "graph.title should name the child layer.",
      "graph.summary should describe the internal detail being modeled.",
      "Include useful graph.nodes and graph.edges unless the user explicitly asks for an empty layer.",
      "Use child-layer semantic types such as endpoint, entity, event-contract, business-rule, validation-rule, policy, worker, service, database, event-channel, and generic-component as needed.",
    ],
  },
  {
    op: "update-graph",
    useFor: "Edit graph title, summary, layerKind, or graph-level metadata.",
    targetRules: ["Use an existing graphId exactly."],
    payloadRules: [
      "Patch title, summary, layerKind, or metadata only.",
      "Patch must change at least one durable graph field. Empty or no-op patches are rejected.",
    ],
  },
]

const SEMANTIC_REPAIR_GUIDE: SemanticRepairGuide[] = [
  {
    findingPattern: "Node is unclassified",
    target: "node",
    repairWith: [
      "update-node semanticType to the best matching known type, or generic-component with architectureType/llmSemanticType for custom concepts.",
      "Also add description and responsibilities when missing.",
    ],
  },
  {
    findingPattern: "Node label is vague or duplicate",
    target: "node",
    repairWith: [
      "update-node name and label to a concrete architecture name.",
      "Add description when the role is still unclear.",
    ],
  },
  {
    findingPattern: "missing responsibilities or description",
    target: "node",
    repairWith: [
      "update-node responsibilities with concrete duties.",
      "Add a short description if responsibilities alone do not explain ownership.",
    ],
  },
  {
    findingPattern: "required or recommended node field missing",
    target: "node",
    repairWith: [
      "Use SEMANTIC_NODE_DEFINITIONS for that semanticType.",
      "update-node the missing field with the smallest truthful value.",
    ],
  },
  {
    findingPattern: "database/store ownership, object data, cache TTL/invalidation",
    target: "node",
    repairWith: [
      "update-node owner, dataOwned, retentionNotes, backupNotes, operationalNotes, retryPolicy, or relevant store fields.",
    ],
  },
  {
    findingPattern: "worker retry/idempotency",
    target: "node",
    repairWith: [
      "update-node retryPolicy, idempotencyRequired, operationalNotes, failureModes.",
    ],
  },
  {
    findingPattern: "public client/auth/security/external trust/sensitive data",
    target: "node",
    repairWith: [
      "update-node authExpectation, authMode, securityNotes, trustNotes, exposure, dataSensitivity, privacyClass.",
    ],
  },
  {
    findingPattern: "AI governance",
    target: "node",
    repairWith: [
      "update-node aiRole, modelProvider, modelClass, toolAccess, safetyNotes, securityNotes, trustNotes, promptPackNotes.",
    ],
  },
  {
    findingPattern: "runtime or observability",
    target: "node",
    repairWith: [
      "update-node runtimeKind, environment, region, owner, operationalNotes, observabilityNotes, signalTypes, incidentNotes.",
    ],
  },
  {
    findingPattern: "empty child layer",
    target: "node",
    repairWith: [
      "create-layer for the node and include starter internal nodes/edges.",
      "Set childLayerPurpose, childLayerSummary, and decompositionStatus through the layer metadata created by apply.",
    ],
  },
  {
    findingPattern: "edge is untyped",
    target: "edge",
    repairWith: [
      "update-edge relationshipType and semanticType to the best relationship type.",
      "Add a concrete label and relationship-specific metadata.",
    ],
  },
  {
    findingPattern: "edge label missing or vague",
    target: "edge",
    repairWith: [
      "update-edge label or labels with a concrete operation, data subject, event, auth dependency, runtime dependency, or reason.",
    ],
  },
  {
    findingPattern: "calls edge missing mechanism/protocol",
    target: "edge",
    repairWith: [
      "update-edge mechanism and/or protocol, plus method/path when known.",
    ],
  },
  {
    findingPattern: "reads/writes/syncs missing data subject or wrong target",
    target: "edge",
    repairWith: [
      "update-edge dataSubject, consistency, protocol.",
      "If the relationship type is wrong, change relationshipType/semanticType instead of forcing reads/writes.",
      "If a missing store is genuinely needed, add-node then add-edge.",
    ],
  },
  {
    findingPattern: "publishes/consumes missing event subject or worker retry/idempotency",
    target: "edge",
    repairWith: [
      "update-edge eventSubject, topic, eventName, retryPolicy, idempotencyNotes, reliability.",
    ],
  },
  {
    findingPattern: "authenticates_via or boundary/external trust missing notes",
    target: "edge",
    repairWith: [
      "update-edge securityNotes, trustNotes, auth, requiredScopes when present as custom metadata.",
    ],
  },
  {
    findingPattern: "runs_on, monitors, triggers",
    target: "edge",
    repairWith: [
      "update-edge mechanism, runtimeKind, operationalNotes, reliability, retryPolicy, or change relationshipType if the edge points to the wrong kind of target.",
    ],
  },
  {
    findingPattern: "event channel has no producer or consumer",
    target: "canvas",
    repairWith: [
      "add-edge or update-edge so producers publish to the event-channel and consumers consume from it.",
    ],
  },
  {
    findingPattern: "raw secret",
    target: "node",
    repairWith: [
      "Never include raw secret values.",
      "Use secretRef or secretCapabilityRef references only.",
    ],
  },
]

function semanticNodeTypeGuide() {
  return SEMANTIC_NODE_TYPES.map((type) => {
    const definition = SEMANTIC_NODE_DEFINITIONS[type]
    return {
      type,
      label: definition.label,
      purpose: definition.purpose,
      requiredFields: definition.requiredFields,
      recommendedFields: definition.recommendedFields,
    }
  })
}

function relationshipTypeGuide() {
  return EDGE_RELATIONSHIP_TYPES.map((type) => {
    const definition = SEMANTIC_EDGE_DEFINITIONS[type]
    return {
      type,
      label: definition.label,
      purpose: definition.purpose,
      requiredFields: definition.requiredFields,
      recommendedFields: definition.recommendedFields,
    }
  })
}

export function buildArchitectCanvasManual() {
  return {
    manualVersion: "canvas-v2-architect-manual-1.0.0",
    purpose:
      "Operational manual for Arc Forge Architect. Use it to produce useful, user-approved Apply to canvas patches from CanvasDoc facts.",
    hardRules: [
      "The durable source of truth is CanvasDoc nodes, edges, graphs, panels, and graph ids provided in canvasPyramid and llmContextPyramid.",
      "Any node in any graph can be edited and can own a child layer. Do not restrict child layers by semantic type, shape, custom type, actor/generic status, or unknown label.",
      "Any durable CanvasNode.data or CanvasEdge.data field may be patched. The field guide lists common inspector fields, but it is not a restrictive allowlist.",
      "Do not patch transient UI state: selected, dragging, hovered, editing drafts, viewport, zoom, pan, cursor, presence, lasso, reconnect ghosts, or other local UI-only state.",
      "Do not include raw secrets. Use secretRef or secretCapabilityRef references.",
      "Use exact existing graph/node/edge ids from context. Use tempId only for newly proposed nodes/edges referenced inside the same proposal.",
      "A patch must do real work. Empty update patches or updates that leave the canvas unchanged are rejected.",
      "Arc Forge never applies changes automatically. User-facing prose must say Apply to canvas and must not mention internal schema field names.",
    ],
    operations: OPERATION_GUIDE,
    nodeDurableFields: NODE_DURABLE_FIELDS,
    edgeDurableFields: EDGE_DURABLE_FIELDS,
    nodeTypes: semanticNodeTypeGuide(),
    edgeRelationshipTypes: relationshipTypeGuide(),
    nodeFields: NODE_FIELD_GUIDE,
    edgeFields: EDGE_FIELD_GUIDE,
    semanticScanRepairPlaybook: SEMANTIC_REPAIR_GUIDE,
    patchExamples: {
      updateNode: {
        op: "update-node",
        graphId: "graph_root",
        nodeId: "existing-node-id",
        patch: {
          semanticType: "service",
          description: "Owns checkout orchestration and validates cart state before payment.",
          responsibilities: ["Validate cart", "Create checkout session", "Coordinate payment authorization"],
          owner: "Checkout domain",
        },
      },
      updateEdge: {
        op: "update-edge",
        graphId: "graph_root",
        edgeId: "existing-edge-id",
        patch: {
          relationshipType: "calls",
          semanticType: "calls",
          label: "POST /checkout",
          mechanism: "REST API",
          protocol: "HTTPS",
          method: "POST",
          path: "/checkout",
        },
      },
      addCustomNode: {
        op: "add-node",
        graphId: "graph_root",
        tempId: "tmp_risk_engine",
        node: {
          label: "Risk Decision Engine",
          semanticType: "generic-component",
          metadata: {
            architectureType: "risk-engine",
            llmSemanticType: "risk-engine",
            description: "Scores checkout risk before payment capture.",
            responsibilities: ["Evaluate fraud signals", "Return allow/review/deny decision"],
          },
        },
      },
      createLayerWithInternals: {
        op: "create-layer",
        parentGraphId: "graph_root",
        parentNodeId: "existing-node-id",
        graph: {
          title: "Checkout Service Internals",
          layerKind: "architecture-layer",
          summary: "Internal endpoints, rules, entities, and event contracts for checkout.",
          nodes: [
            {
              tempId: "tmp_checkout_endpoint",
              label: "POST /checkout",
              semanticType: "endpoint",
              metadata: {
                method: "POST",
                path: "/checkout",
                responsibilities: ["Accept checkout requests"],
              },
            },
            {
              tempId: "tmp_order_entity",
              label: "Order",
              semanticType: "entity",
              metadata: {
                fields: ["id", "customerId", "status", "total"],
              },
            },
          ],
          edges: [
            {
              source: "tmp_checkout_endpoint",
              target: "tmp_order_entity",
              relationshipType: "writes",
              label: "creates order draft",
              metadata: {
                dataSubject: "order draft",
                idempotencyNotes: "Use checkout idempotency key for retries.",
              },
            },
          ],
        },
      },
    },
  }
}
