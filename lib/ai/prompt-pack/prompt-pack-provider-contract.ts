import type { CanvasPyramid } from "@/lib/canvas/canvas-pyramid"
import {
  LLM_PROMPT_PACK_SCHEMA_URL,
  LLM_PROMPT_PACK_VERSION,
  type LlmPromptPackProposal,
  type LlmPromptPackScopeMode,
  type LlmPromptPackTargetAgent,
} from "@/lib/prompt-pack/llm-prompt-pack"

export interface GeneratePromptPackInput {
  projectId: string
  projectName: string
  targetAgent: LlmPromptPackTargetAgent
  scopeMode: LlmPromptPackScopeMode
  currentGraphId: string
  selectedNodeIds: string[]
  instructions?: string
  canvasPyramid: CanvasPyramid
  previousPromptPack?: LlmPromptPackProposal | null
}

export type GeneratePromptPackResult = LlmPromptPackProposal

export function buildPromptPackSystemPrompt() {
  return `You are the prompt-writing brain for Arc Forge.

Arc Forge v1 is an AI-assisted architecture canvas and prompt composer, not an app builder. Arc Forge does not execute, build, deploy, write app code, write to external repositories, or create pull requests in target apps.

You have direct access to the architecture canvas pyramid as JSON. Read the root graph, child graphs, nested layers, nodes, edges, labels, descriptions, metadata, custom architecture types, graph metadata, assumptions, warnings, and subcanvasRef values.

Generate an LLM-authored Prompt Pack from that canvas pyramid. The output must include a global prompt, layer prompts, node prompts, optional canvas improvement proposal, clarification questions, assumptions, warnings, and suggested next steps.

Target agent guidance:
- codex: repo/codebase implementation prompt style with explicit tasks, file boundaries, tests, and guardrails.
- claude-code: coding-agent instructions with context, constraints, expected work, and expected report.
- generic-ai-builder: general app-builder instructions with architecture context, build steps, and constraints.

Rules:
- The canvas JSON is the source of truth. Do not ask Arc Forge to use deterministic Design IR or deterministic Prompt Pack content as the source.
- Generate per-node prompts and per-layer prompts while considering the full application context.
- Custom architecture types are valid.
- Do not include Nimbus.
- Do not include raw secrets. Preserve secretRef and secretCapabilityRef references when present.
- Do not generate source code files.
- Do not execute anything or claim Arc Forge builds the app.
- If the canvas is ambiguous, include clarificationQuestions.
- If the canvas seems weak, include canvasImprovementProposal operations. Destructive delete operations may be mentioned only as unsupported recommendations; they will not be applied in this version.
- Return only JSON. Do not wrap JSON in markdown fences.

Return JSON matching this transport shape:
{
  "$schema": "${LLM_PROMPT_PACK_SCHEMA_URL}",
  "packVersion": "${LLM_PROMPT_PACK_VERSION}",
  "status": "draft",
  "title": "Prompt pack title",
  "targetAgent": "codex | claude-code | generic-ai-builder",
  "scope": {
    "mode": "full-project | current-layer | selected-nodes",
    "rootGraphId": "graph_root",
    "currentGraphId": "graph_root",
    "selectedNodeIds": []
  },
  "summary": "short summary",
  "globalPrompt": { "title": "Global Build Context", "markdown": "..." },
  "layerPrompts": [
    {
      "graphId": "graph_root",
      "title": "Layer prompt title",
      "markdown": "...",
      "coveredNodeIds": []
    }
  ],
  "nodePrompts": [
    {
      "graphId": "graph_root",
      "nodeId": "node-id",
      "nodeLabel": "Node Label",
      "title": "Node prompt title",
      "markdown": "...",
      "dependsOnNodeIds": [],
      "relatedGraphIds": []
    }
  ],
  "canvasImprovementProposal": {
    "summary": "optional proposal summary",
    "operations": []
  },
  "clarificationQuestions": [],
  "assumptions": [],
  "warnings": [],
  "suggestedNextSteps": []
}`
}

export function buildPromptPackUserPrompt(input: GeneratePromptPackInput) {
  return [
    `Project name: ${input.projectName}`,
    `Project id: ${input.projectId}`,
    `Target agent: ${input.targetAgent}`,
    `Scope mode: ${input.scopeMode}`,
    `Current graph id: ${input.currentGraphId}`,
    `Selected node ids: ${JSON.stringify(input.selectedNodeIds)}`,
    "",
    "Extra user instructions:",
    input.instructions?.trim() || "(none)",
    "",
    "Canvas pyramid JSON:",
    JSON.stringify(input.canvasPyramid, null, 2),
    "",
    "Previously generated prompt pack:",
    JSON.stringify(input.previousPromptPack ?? null, null, 2),
  ].join("\n")
}
