import type { DesignIrV1 } from "@/lib/canvas/design-ir"
import type {
  ArchitectureDraftComplexity,
  ArchitectureDraftProposal,
} from "@/lib/architecture-draft/architecture-draft"
import {
  ARCHITECTURE_DRAFT_SCHEMA_URL,
  ARCHITECTURE_DRAFT_VERSION,
  ARCHITECTURE_DRAFT_COMPLEXITIES,
} from "@/lib/architecture-draft/architecture-draft"
import { AI_ASSISTANT_NAME } from "@/lib/branding"

export interface GenerateArchitectureDraftInput {
  prompt: string
  projectId: string
  graphId: string
  complexity: ArchitectureDraftComplexity
  existingDesignIr?: DesignIrV1 | null
  currentCanvasSummary?: Record<string, unknown> | null
}

export type GenerateArchitectureDraftResult = ArchitectureDraftProposal

export function buildArchitectureDraftSystemPrompt() {
  return `You are ${AI_ASSISTANT_NAME}, a senior system architect.

Arc Forge v1 is an AI-assisted architecture compiler, not an app builder. You propose architecture drafts only. Arc Forge does not execute, build, deploy, or write app code.

Return only JSON matching this contract:
{
  "$schema": "${ARCHITECTURE_DRAFT_SCHEMA_URL}",
  "draftVersion": "${ARCHITECTURE_DRAFT_VERSION}",
  "status": "draft",
  "title": "short architecture title",
  "summary": "plain-language summary",
  "targetGraphId": "graph_root",
  "complexity": "${ARCHITECTURE_DRAFT_COMPLEXITIES.join(" | ")}",
  "nodes": [
    {
      "id": "service-booking-service",
      "semanticType": "service",
      "label": "Booking Service",
      "name": "Booking Service",
      "description": "Owns booking workflow.",
      "metadata": {
        "serviceKind": "application-service",
        "runtime": "node-typescript",
        "language": "typescript",
        "framework": "nextjs-api",
        "tenancy": "owner-scoped-now-workspace-compatible-later",
        "authMode": "internal-cookie-session"
      },
      "position": { "x": 320, "y": 120 }
    }
  ],
  "edges": [
    {
      "id": "edge-frontend-booking-http-call",
      "source": "frontend-customer-app",
      "target": "service-booking-service",
      "semanticType": "http-call",
      "label": "POST /bookings",
      "labels": ["POST /bookings"],
      "metadata": { "operationHint": "create booking", "method": "POST", "path": "/bookings" }
    }
  ],
  "assumptions": [],
  "warnings": [],
  "suggestedNextSteps": []
}

Supported root node semanticType values: service, api, frontend, database, cache, queue, worker, external-system, auth-module, domain-model, policy.
Supported edge semanticType values: http-call, graphql-call, db-read, db-write, event-publish, event-consume, webhook-in, webhook-out, auth-check, depends-on, invokes-worker, contains, guards, validates.

Rules:
- targetGraphId must be graph_root.
- Use stable safe lowercase IDs with dashes or underscores.
- Include required metadata fields for each semantic type.
- Do not include selected, dragging, hovered, cursor, presence, open popover, draft text, or any other UI state.
- Do not include raw secrets. Use secretRef:... or secretCapabilityRef:... only when a secret reference is needed.
- Return a proposal for the current root canvas. Do not overwrite existing nodes.`
}

export function buildArchitectureDraftUserPrompt(input: GenerateArchitectureDraftInput) {
  const compactDesignIr = input.existingDesignIr
    ? {
        project: input.existingDesignIr.project,
        graphs: input.existingDesignIr.graphs,
        services: input.existingDesignIr.services.slice(0, 24),
        dataModels: input.existingDesignIr.dataModels.slice(0, 24),
        workers: input.existingDesignIr.workers.slice(0, 24),
        frontends: input.existingDesignIr.frontends.slice(0, 12),
        externalSystems: input.existingDesignIr.externalSystems.slice(0, 12),
        policies: input.existingDesignIr.policies.slice(0, 16),
        relations: input.existingDesignIr.relations.slice(0, 48),
        validationSummary: input.existingDesignIr.validationSummary,
      }
    : null

  return [
    `User architecture request: ${input.prompt}`,
    "",
    `Project id: ${input.projectId}`,
    `Target graph id: ${input.graphId}`,
    `Complexity: ${input.complexity}`,
    "",
    "Current canvas summary:",
    JSON.stringify(input.currentCanvasSummary ?? {}, null, 2).slice(0, 12000),
    "",
    "Existing Design IR summary:",
    JSON.stringify(compactDesignIr ?? {}, null, 2).slice(0, 16000),
  ].join("\n")
}
