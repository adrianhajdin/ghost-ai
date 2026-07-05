import type {
  CanvasNodeData,
  NodeShape,
  SemanticNodeType,
} from "@/types/canvas"
import {
  NODE_COLORS,
  SHAPE_DEFAULTS,
  normalizeSemanticNodeType,
  semanticNodeTypeLabel,
} from "@/types/canvas"

export type SemanticTemplateType =
  | "actor"
  | "client-surface"
  | "service"
  | "worker"
  | "database"
  | "event-channel"
  | "external-system"
  | "identity-auth"
  | "generic-component"
  | "cache-store"
  | "object-store"
  | "reference-proxy"
  | "runtime-deployment"
  | "observability-control"
  | "ai-component"
export type ServiceInternalTemplateType =
  | "endpoint"
  | "entity"
  | "worker"
  | "event-contract"
  | "business-rule"
  | "validation-rule"
  | "policy"

export interface SemanticNodeTemplate {
  semanticType: SemanticTemplateType | ServiceInternalTemplateType
  title: string
  shape: NodeShape
  colorIndex: number
  group?: "default" | "advanced" | "internal"
  data: Partial<CanvasNodeData>
}

export const SEMANTIC_NODE_TEMPLATES: SemanticNodeTemplate[] = [
  {
    semanticType: "client-surface",
    title: "Client Surface",
    shape: "rectangle",
    colorIndex: 5,
    group: "default",
    data: {
      semanticType: "client-surface",
      label: "Client Surface",
      name: "Client Surface",
      responsibilities: ["User-facing interaction surface"],
      layerRole: "experience",
      interfacesConsumed: [],
    },
  },
  {
    semanticType: "service",
    title: "Service",
    shape: "pill",
    colorIndex: 1,
    group: "default",
    data: {
      semanticType: "service",
      label: "Service",
      name: "Service",
      responsibilities: ["Own a bounded runtime responsibility"],
      layerRole: "application-service",
      serviceKind: "application-service",
      runtime: "node-typescript",
      language: "typescript",
      framework: "",
      tenancy: "owner-scoped-now-workspace-compatible-later",
      authMode: "internal-cookie-session",
    },
  },
  {
    semanticType: "worker",
    title: "Worker / Job",
    shape: "hexagon",
    colorIndex: 6,
    group: "default",
    data: {
      semanticType: "worker",
      label: "Worker / Job",
      name: "Worker / Job",
      responsibilities: ["Process asynchronous work safely"],
      layerRole: "background-job",
      triggerType: "manual-or-event",
      retryPolicy: "required",
      idempotencyRequired: true,
    },
  },
  {
    semanticType: "database",
    title: "Database",
    shape: "cylinder",
    colorIndex: 7,
    group: "default",
    data: {
      semanticType: "database",
      label: "Database",
      name: "Database",
      responsibilities: ["Persist durable application data"],
      layerRole: "state-store",
      dbKind: "relational",
      engine: "postgresql",
      orm: "prisma",
    },
  },
  {
    semanticType: "event-channel",
    title: "Event Channel",
    shape: "diamond",
    colorIndex: 3,
    group: "default",
    data: {
      semanticType: "event-channel",
      label: "Event Channel",
      name: "Event Channel",
      responsibilities: ["Carry asynchronous domain events or commands"],
      layerRole: "message-channel",
      eventsEmitted: [],
      eventsConsumed: [],
    },
  },
  {
    semanticType: "external-system",
    title: "External System",
    shape: "hexagon",
    colorIndex: 3,
    group: "default",
    data: {
      semanticType: "external-system",
      label: "External System",
      name: "External System",
      responsibilities: ["Represent an external dependency or provider"],
      layerRole: "external-provider",
      securityNotes: "",
      trustNotes: "",
    },
  },
  {
    semanticType: "identity-auth",
    title: "Identity / Auth",
    shape: "pill",
    colorIndex: 2,
    group: "default",
    data: {
      semanticType: "identity-auth",
      label: "Identity / Auth",
      name: "Identity / Auth",
      responsibilities: ["Authenticate users, sessions, and access boundaries"],
      layerRole: "identity-boundary",
      authStrategy: "internal-cookie-session",
      sessionMode: "httpOnly-cookie",
      emailVerification: true,
    },
  },
  {
    semanticType: "generic-component",
    title: "Generic Component",
    shape: "rectangle",
    colorIndex: 0,
    group: "default",
    data: {
      semanticType: "generic-component",
      label: "Generic Component",
      name: "Generic Component",
      responsibilities: [],
      layerRole: "custom",
    },
  },
  {
    semanticType: "actor",
    title: "Actor",
    shape: "circle",
    colorIndex: 2,
    group: "advanced",
    data: {
      semanticType: "actor",
      label: "Actor",
      name: "Actor",
      responsibilities: ["Initiates or participates in system interactions"],
      layerRole: "external-persona",
    },
  },
  {
    semanticType: "cache-store",
    title: "Cache / Session Store",
    shape: "cylinder",
    colorIndex: 6,
    group: "advanced",
    data: {
      semanticType: "cache-store",
      label: "Cache / Session Store",
      name: "Cache / Session Store",
      responsibilities: ["Hold short-lived or session-oriented state"],
      layerRole: "ephemeral-store",
      dataOwned: [],
    },
  },
  {
    semanticType: "object-store",
    title: "Object / File Store",
    shape: "cylinder",
    colorIndex: 7,
    group: "advanced",
    data: {
      semanticType: "object-store",
      label: "Object / File Store",
      name: "Object / File Store",
      responsibilities: ["Store objects, files, or generated artifacts"],
      layerRole: "blob-store",
      dataOwned: [],
    },
  },
  {
    semanticType: "reference-proxy",
    title: "Reference Proxy",
    shape: "rectangle",
    colorIndex: 0,
    group: "advanced",
    data: {
      semanticType: "reference-proxy",
      label: "Reference Proxy",
      name: "Reference Proxy",
      responsibilities: ["Reference a node, edge, or layer owned elsewhere"],
      layerRole: "cross-layer-reference",
      referenceKind: "node",
      proxyDirection: "context",
    },
  },
  {
    semanticType: "runtime-deployment",
    title: "Runtime / Deployment Unit",
    shape: "hexagon",
    colorIndex: 1,
    group: "advanced",
    data: {
      semanticType: "runtime-deployment",
      label: "Runtime / Deployment Unit",
      name: "Runtime / Deployment Unit",
      responsibilities: ["Describe where software runs"],
      layerRole: "runtime-deployment",
      runtimeKind: "",
      environment: "",
      region: "",
      operationalNotes: "",
    },
  },
  {
    semanticType: "observability-control",
    title: "Observability / Control Plane",
    shape: "hexagon",
    colorIndex: 7,
    group: "advanced",
    data: {
      semanticType: "observability-control",
      label: "Observability / Control Plane",
      name: "Observability / Control Plane",
      responsibilities: ["Capture signals, audit, alerts, and operational control"],
      layerRole: "observability-control",
      signalTypes: [],
      operationalNotes: "",
    },
  },
  {
    semanticType: "ai-component",
    title: "AI Component",
    shape: "pill",
    colorIndex: 2,
    group: "advanced",
    data: {
      semanticType: "ai-component",
      label: "AI Component",
      name: "AI Component",
      responsibilities: ["Own AI reasoning, retrieval, moderation, or tool access"],
      layerRole: "ai-component",
      toolAccess: [],
      safetyNotes: "",
      securityNotes: "",
    },
  },
]

export const SERVICE_INTERNAL_NODE_TEMPLATES: SemanticNodeTemplate[] = [
  {
    semanticType: "endpoint",
    title: "Endpoint",
    shape: "circle",
    colorIndex: 1,
    data: {
      semanticType: "endpoint",
      label: "Endpoint",
      name: "Endpoint",
      method: "POST",
      path: "/resource",
      authRequired: true,
      idempotent: false,
      status: "draft",
    },
  },
  {
    semanticType: "entity",
    title: "Entity",
    shape: "rectangle",
    colorIndex: 7,
    data: {
      semanticType: "entity",
      label: "Entity",
      name: "Entity",
      fields: [],
      tenantKey: "tenantId",
      status: "draft",
    },
  },
  {
    semanticType: "worker",
    title: "Worker",
    shape: "hexagon",
    colorIndex: 6,
    data: {
      semanticType: "worker",
      label: "Worker",
      name: "Worker",
      triggerType: "event",
      retryPolicy: "required",
      idempotencyRequired: true,
      status: "draft",
    },
  },
  {
    semanticType: "event-contract",
    title: "Event",
    shape: "diamond",
    colorIndex: 3,
    data: {
      semanticType: "event-contract",
      label: "Event",
      name: "Event",
      direction: "published",
      topic: "domain.event",
      deliveryGuarantee: "at-least-once",
      status: "draft",
    },
  },
  {
    semanticType: "business-rule",
    title: "Business Rule",
    shape: "rectangle",
    colorIndex: 2,
    data: {
      semanticType: "business-rule",
      label: "Business Rule",
      name: "Business Rule",
      ruleType: "invariant",
      status: "draft",
    },
  },
  {
    semanticType: "validation-rule",
    title: "Validation",
    shape: "diamond",
    colorIndex: 4,
    data: {
      semanticType: "validation-rule",
      label: "Validation",
      name: "Validation",
      validationScope: "input",
      severity: "error",
      status: "draft",
    },
  },
  {
    semanticType: "policy",
    title: "Policy",
    shape: "pill",
    colorIndex: 5,
    data: {
      semanticType: "policy",
      label: "Policy",
      name: "Policy",
      policyKind: "security",
      enforcementMode: "server-side",
      auditRequired: true,
      status: "draft",
    },
  },
]

export function baseNodeData(label = ""): CanvasNodeData {
  return {
    label,
    name: label,
    semanticType: label ? "generic-component" : "unclassified",
    status: "draft",
    maturity: "draft",
    responsibilities: [],
    tags: [],
    sourceRefs: [],
    assumptions: [],
    decisionRefs: [],
    owner: null,
    boundary: "",
    trustZone: "",
    exposure: "unknown",
    dataSensitivity: "unknown",
    authExpectation: "",
    layerRole: "",
    interfacesExposed: [],
    interfacesConsumed: [],
    dataOwned: [],
    dataRead: [],
    eventsEmitted: [],
    eventsConsumed: [],
    technology: "",
    runtimeKind: "",
    environment: "",
    region: "",
    securityNotes: "",
    privacyClass: "",
    operationalNotes: "",
    openQuestions: [],
    promptPackNotes: "",
    signalTypes: [],
    toolAccess: [],
    safetyNotes: "",
    retrievalNotes: "",
    costNotes: "",
    color: NODE_COLORS[0].fill,
    textColor: NODE_COLORS[0].text,
    shape: "rectangle",
  }
}

export function semanticDefaultsForType(
  semanticType: SemanticNodeType
): Partial<CanvasNodeData> {
  const canonicalType = normalizeSemanticNodeType(semanticType) ?? "generic-component"
  const common = {
    semanticType: canonicalType,
    layerRole: "",
    responsibilities: [],
  } satisfies Partial<CanvasNodeData>

  if (canonicalType === "actor") {
    return {
      ...common,
      layerRole: "external-persona",
      responsibilities: ["Initiates or participates in system interactions"],
    }
  }

  if (canonicalType === "client-surface") {
    return {
      ...common,
      layerRole: "experience",
      responsibilities: ["User-facing interaction surface"],
      interfacesConsumed: [],
    }
  }

  if (canonicalType === "service") {
    return {
      ...common,
      layerRole: "application-service",
      responsibilities: ["Own a bounded runtime responsibility"],
      serviceKind: "application-service",
      runtime: "node-typescript",
      language: "typescript",
      framework: "",
      tenancy: "owner-scoped-now-workspace-compatible-later",
      authMode: "internal-cookie-session",
    }
  }

  if (canonicalType === "database") {
    return {
      ...common,
      layerRole: "state-store",
      responsibilities: ["Persist durable application data"],
      dbKind: "relational",
      engine: "postgresql",
      orm: "prisma",
    }
  }

  if (canonicalType === "event-channel") {
    return {
      ...common,
      layerRole: "message-channel",
      responsibilities: ["Carry asynchronous domain events or commands"],
      eventsEmitted: [],
      eventsConsumed: [],
    }
  }

  if (canonicalType === "worker") {
    return {
      ...common,
      layerRole: "background-job",
      responsibilities: ["Process asynchronous work safely"],
      triggerType: "manual-or-event",
      retryPolicy: "required",
      idempotencyRequired: true,
    }
  }

  if (canonicalType === "external-system") {
    return {
      ...common,
      layerRole: "external-provider",
      responsibilities: ["Represent an external dependency or provider"],
      securityNotes: "",
      trustNotes: "",
    }
  }

  if (canonicalType === "identity-auth") {
    return {
      ...common,
      layerRole: "identity-boundary",
      responsibilities: ["Authenticate users, sessions, and access boundaries"],
      authStrategy: "internal-cookie-session",
      sessionMode: "httpOnly-cookie",
      emailVerification: true,
    }
  }

  if (canonicalType === "generic-component") {
    return {
      ...common,
      layerRole: "custom",
    }
  }

  if (canonicalType === "cache-store") {
    return {
      ...common,
      layerRole: "ephemeral-store",
      responsibilities: ["Hold short-lived or session-oriented state"],
      dataOwned: [],
    }
  }

  if (canonicalType === "object-store") {
    return {
      ...common,
      layerRole: "blob-store",
      responsibilities: ["Store objects, files, or generated artifacts"],
      dataOwned: [],
    }
  }

  if (canonicalType === "reference-proxy") {
    return {
      ...common,
      layerRole: "cross-layer-reference",
      responsibilities: ["Reference a node, edge, or layer owned elsewhere"],
      referenceKind: "node",
      proxyDirection: "context",
    }
  }

  if (canonicalType === "runtime-deployment") {
    return {
      ...common,
      layerRole: "runtime-deployment",
      responsibilities: ["Describe where software runs"],
      runtimeKind: "",
      environment: "",
      region: "",
      operationalNotes: "",
    }
  }

  if (canonicalType === "observability-control") {
    return {
      ...common,
      layerRole: "observability-control",
      responsibilities: ["Capture signals, audit, alerts, and operational control"],
      signalTypes: [],
      operationalNotes: "",
    }
  }

  if (canonicalType === "ai-component") {
    return {
      ...common,
      layerRole: "ai-component",
      responsibilities: ["Own AI reasoning, retrieval, moderation, or tool access"],
      toolAccess: [],
      safetyNotes: "",
      securityNotes: "",
    }
  }

  if (canonicalType === "endpoint") {
    return {
      ...common,
      method: "POST",
      path: "/resource",
      authRequired: true,
      idempotent: false,
    }
  }

  if (canonicalType === "entity") {
    return {
      ...common,
      fields: [],
      tenantKey: "tenantId",
    }
  }

  if (canonicalType === "event-contract") {
    return {
      ...common,
      direction: "published",
      topic: "domain.event",
      deliveryGuarantee: "at-least-once",
    }
  }

  if (canonicalType === "business-rule") {
    return {
      ...common,
      ruleType: "invariant",
    }
  }

  if (canonicalType === "validation-rule") {
    return {
      ...common,
      validationScope: "input",
      severity: "error",
    }
  }

  if (canonicalType === "policy") {
    return {
      ...common,
      policyKind: "security",
      enforcementMode: "server-side",
      auditRequired: true,
    }
  }

  return {
    ...common,
    layerRole: semanticNodeTypeLabel(canonicalType).toLowerCase().replace(/\s+\/\s+/g, "-"),
  }
}

export function semanticTemplateSize(template: SemanticNodeTemplate) {
  return SHAPE_DEFAULTS[template.shape]
}
