"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Info,
  MessageSquare,
  SquareArrowOutUpRight,
  Wrench,
} from "lucide-react"
import type {
  CanvasEdge,
  CanvasEdgeData,
  CanvasDecompositionStatus,
  CanvasNode,
  CanvasNodeData,
  SemanticNodeType,
} from "@/types/canvas"
import {
  ADVANCED_EDGE_RELATIONSHIP_TYPES,
  QUICK_EDGE_RELATIONSHIP_TYPES,
  SEMANTIC_NODE_PICKER_TYPES,
  edgeRelationshipTypeLabel,
  normalizeEdgeRelationshipType,
  semanticNodeTypeLabel,
  type EdgeRelationshipType,
} from "@/types/canvas"
import { semanticDefaultsForType } from "@/lib/canvas/semantic-defaults"
import {
  SEMANTIC_VALIDATION_CATEGORY_LABELS,
  groupSemanticFindings,
  isSemanticFindingHidden,
  type SemanticScanState,
  type SemanticValidationResult,
} from "@/lib/canvas/semantic-validation"
import {
  createEdgeLabelItems,
  edgeLabelTexts,
  mirrorEdgeLabelData,
  normalizeEdgeLabelItems,
} from "@/lib/canvas/edge-labels"
import { useCanvasMutations } from "@/components/editor/canvas/canvas-mutation-context"

interface SemanticInspectorProps {
  projectId: string
  currentGraphId: string
  selectedNode: CanvasNode | null
  selectedEdge: CanvasEdge | null
  warnings: SemanticValidationResult[]
  semanticScanState: SemanticScanState
  onSemanticScanStateChange: (state: SemanticScanState) => void
  onSendSemanticFindingToArchitect?: (message: string) => void
}

interface DraftFieldProps {
  label: string
  value: string
  onCommit: (value: string) => void
  multiline?: boolean
}

interface CondensedWarning {
  id: string
  ids: string[]
  message: string
  severity: SemanticValidationResult["severity"]
  category: SemanticValidationResult["category"]
  targetRefs: string[]
  fields: string[]
  count: number
}

const NODE_TYPE_OPTIONS = [
  "unclassified",
  ...SEMANTIC_NODE_PICKER_TYPES,
] as const satisfies readonly SemanticNodeType[]

const RELATIONSHIP_TYPE_OPTIONS = [
  ...QUICK_EDGE_RELATIONSHIP_TYPES,
  ...ADVANCED_EDGE_RELATIONSHIP_TYPES,
] as const satisfies readonly EdgeRelationshipType[]

const DECOMPOSITION_STATUS_OPTIONS = [
  "none",
  "planned",
  "partial",
  "complete",
  "stale",
] as const satisfies readonly CanvasDecompositionStatus[]

const EXPOSURE_OPTIONS = [
  "private",
  "internal",
  "partner",
  "public",
  "unknown",
] as const

const DATA_SENSITIVITY_OPTIONS = [
  "public",
  "internal",
  "confidential",
  "restricted",
  "regulated",
  "unknown",
] as const

const REFERENCE_KIND_OPTIONS = ["node", "edge", "graph"] as const
const PROXY_DIRECTION_OPTIONS = ["inbound", "outbound", "bidirectional", "context"] as const
const RELATIONSHIP_CRITICALITY_OPTIONS = ["low", "medium", "high", "critical"] as const
const RELATIONSHIP_DIRECTIONALITY_OPTIONS = [
  "directed",
  "bidirectional",
  "inferred",
] as const

function toList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : []
}

function condenseWarnings(warnings: SemanticValidationResult[]): CondensedWarning[] {
  const byMessage = new Map<string, CondensedWarning>()

  for (const warning of warnings) {
    const key = `${warning.category}:${warning.severity}:${warning.message}`
    const current = byMessage.get(key)
    if (current) {
      current.count += 1
      current.ids.push(warning.id)
      const targetRef = warning.targetId
        ? `${warning.targetKind}:${warning.targetId}`
        : warning.targetKind
      if (!current.targetRefs.includes(targetRef)) current.targetRefs.push(targetRef)
      if (warning.field && !current.fields.includes(warning.field)) {
        current.fields.push(warning.field)
      }
    } else {
      const targetRef = warning.targetId
        ? `${warning.targetKind}:${warning.targetId}`
        : warning.targetKind
      byMessage.set(key, {
        id: warning.id,
        ids: [warning.id],
        message: warning.message,
        severity: warning.severity,
        category: warning.category,
        targetRefs: [targetRef],
        fields: warning.field ? [warning.field] : [],
        count: 1,
      })
    }
  }

  const rank = { error: 0, warning: 1, info: 2 } as const
  return [...byMessage.values()].sort(
    (a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count
  )
}

function semanticFindingArchitectPrompt(input: {
  mode: "fix" | "ask"
  graphId: string
  warning: CondensedWarning
}) {
  const { mode, graphId, warning } = input
  const category = SEMANTIC_VALIDATION_CATEGORY_LABELS[warning.category]
  const targetCopy = warning.targetRefs.length
    ? warning.targetRefs.slice(0, 12).join(", ")
    : "current graph"
  const fieldCopy = warning.fields.length ? warning.fields.join(", ") : "not specified"
  const idCopy = warning.ids.slice(0, 16).join(", ")
  const groupedCopy =
    warning.count > 1
      ? `This represents ${warning.count} grouped findings. Keep any proposed patch small and reviewable.`
      : "This is one semantic scan finding."

  if (mode === "ask") {
    return [
      "Explain this Semantic Scan finding from Arc Forge.",
      `Graph: ${graphId}`,
      `Category: ${category}`,
      `Severity: ${warning.severity}`,
      `Targets: ${targetCopy}`,
      `Field: ${fieldCopy}`,
      `Finding IDs: ${idCopy}`,
      `Message: ${warning.message}`,
      groupedCopy,
      "Tell me why it matters, what the safe options are, and when it is okay to leave it intentional. Do not propose a canvas patch unless it is clearly useful.",
    ].join("\n")
  }

  return [
    "Please fix this Semantic Scan finding in Arc Forge by proposing a small, user-approved patch for the Apply to canvas flow.",
    `Graph: ${graphId}`,
    `Category: ${category}`,
    `Severity: ${warning.severity}`,
    `Targets: ${targetCopy}`,
    `Field: ${fieldCopy}`,
    `Finding IDs: ${idCopy}`,
    `Message: ${warning.message}`,
    groupedCopy,
    "Use the same kind of semantic edits a human can make in the canvas/inspector: update-node for node metadata, update-edge for edge relationshipType/labels/metadata, add-node/add-edge/create-layer only when genuinely needed.",
    "Do not claim anything was applied until Arc Forge sends application-state feedback after the user presses Apply to canvas. Keep the proposal reviewable and mention any remaining findings after the proposed patch.",
  ].join("\n")
}

function DraftField({ label, value, onCommit, multiline }: DraftFieldProps) {
  return (
    <DraftFieldInner
      key={`${label}:${value}`}
      label={label}
      value={value}
      onCommit={onCommit}
      multiline={multiline}
    />
  )
}

function DraftFieldInner({ label, value, onCommit, multiline }: DraftFieldProps) {
  const [draft, setDraft] = useState(value)

  const commit = () => {
    if (draft !== value) onCommit(draft.trim())
  }

  const className =
    "w-full rounded-xl border border-border-default bg-bg-elevated px-2.5 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent-primary/60"

  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-medium text-text-muted">{label}</span>
      {multiline ? (
        <textarea
          value={draft}
          rows={3}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          className={`${className} resize-none`}
        />
      ) : (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
            if (event.key === "Escape") setDraft(value)
          }}
          className={className}
        />
      )}
    </label>
  )
}

function ListField({
  label,
  values,
  onCommit,
}: {
  label: string
  values: string[]
  onCommit: (values: string[]) => void
}) {
  return (
    <DraftField
      label={label}
      value={values.join(", ")}
      onCommit={(value) =>
        onCommit(
          value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        )
      }
    />
  )
}

function SelectField<TValue extends string>({
  label,
  value,
  options,
  optionLabel,
  onChange,
}: {
  label: string
  value: TValue
  options: readonly TValue[]
  optionLabel: (value: TValue) => string
  onChange: (value: TValue) => void
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-medium text-text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TValue)}
        className="w-full rounded-xl border border-border-default bg-bg-elevated px-2.5 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent-primary/60"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  )
}

function BooleanField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-border-default bg-bg-elevated px-2.5 py-2 text-xs text-text-secondary">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[var(--color-accent-primary)]"
      />
    </label>
  )
}

function SummaryPill({
  label,
  value,
}: {
  label: string
  value: string | number | undefined | null
}) {
  if (value === undefined || value === null || value === "") return null
  return (
    <span className="rounded-full border border-border-subtle bg-bg-subtle px-2 py-1 text-[10px] text-text-secondary">
      <span className="text-text-faint">{label}: </span>
      {value}
    </span>
  )
}

function firstListValue(value: unknown) {
  return Array.isArray(value)
    ? value
        .find((item): item is string => typeof item === "string" && item.trim().length > 0)
        ?.trim()
    : undefined
}

function EmptySectionNote({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border-subtle bg-bg-subtle/40 px-2.5 py-2 text-xs text-text-muted">
      Add {label}
    </div>
  )
}

function InspectorSection({
  title,
  defaultOpen,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-2xl border border-border-default bg-bg-elevated/80 px-3 py-2"
    >
      <summary className="cursor-pointer select-none text-xs font-semibold text-text-primary">
        {title}
      </summary>
      <div className="mt-3 grid gap-2">{children}</div>
    </details>
  )
}

function NodeSummaryCard({ node }: { node: CanvasNode }) {
  const responsibility = firstListValue(node.data.responsibilities) ?? node.data.description
  const keyInterfaces = [
    firstListValue(node.data.interfacesExposed),
    firstListValue(node.data.interfacesConsumed),
  ].filter(Boolean)
  const keyDataEvents = [
    firstListValue(node.data.dataOwned),
    firstListValue(node.data.dataRead),
    firstListValue(node.data.eventsEmitted),
    firstListValue(node.data.eventsConsumed),
  ].filter(Boolean)

  return (
    <div className="rounded-2xl border border-accent-primary/20 bg-accent-primary-dim/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">
            {node.data.name || node.data.label || node.id}
          </p>
          <p className="mt-1 text-[11px] text-accent-primary">
            {semanticNodeTypeLabel(node.data.semanticType)}
          </p>
        </div>
        {node.data.hasChildLayer || node.data.subcanvasRef?.graphId ? (
          <span className="shrink-0 rounded-full border border-accent-primary/35 bg-bg-surface px-2 py-0.5 text-[10px] text-accent-primary">
            Layer · {node.data.decompositionStatus ?? "planned"}
          </span>
        ) : null}
      </div>
      {responsibility ? (
        <p className="mt-2 max-h-10 overflow-hidden text-xs leading-5 text-text-secondary">
          {responsibility}
        </p>
      ) : null}
      {node.data.childLayerSummary || node.data.lastLayerSummary ? (
        <p className="mt-2 rounded-xl border border-border-subtle bg-bg-surface/70 px-2 py-1.5 text-[11px] leading-4 text-text-muted">
          {node.data.childLayerSummary || node.data.lastLayerSummary}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <SummaryPill label="Owner" value={node.data.owner} />
        <SummaryPill label="Boundary" value={node.data.boundary} />
        <SummaryPill label="Exposure" value={node.data.exposure} />
        <SummaryPill label="Sensitivity" value={node.data.dataSensitivity} />
        <SummaryPill label="Ref" value={node.data.referencedLabel} />
        <SummaryPill label="Interfaces" value={keyInterfaces.join(", ")} />
        <SummaryPill label="Data/events" value={keyDataEvents.join(", ")} />
        <SummaryPill label="Status" value={node.data.status} />
        <SummaryPill label="Maturity" value={String(node.data.maturity ?? "")} />
      </div>
    </div>
  )
}

function EdgeSummaryCard({ edge }: { edge: CanvasEdge }) {
  const data = edge.data ?? {}
  const relationshipType =
    normalizeEdgeRelationshipType(data.relationshipType ?? data.semanticType) ??
    "depends_on"
  const labels = edgeLabelTexts(data)

  return (
    <div className="rounded-2xl border border-accent-primary/20 bg-accent-primary-dim/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">
            {labels[0] || data.name || edge.id}
          </p>
          <p className="mt-1 text-[11px] text-accent-primary">
            {edgeRelationshipTypeLabel(relationshipType)}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border-subtle bg-bg-surface px-2 py-0.5 text-[10px] text-text-muted">
          {edge.source} → {edge.target}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <SummaryPill label="Mechanism" value={String(data.mechanism ?? "")} />
        <SummaryPill label="Protocol" value={String(data.protocol ?? "")} />
        <SummaryPill label="Sync" value={String(data.syncMode ?? "")} />
        <SummaryPill label="Criticality" value={String(data.criticality ?? "")} />
        <SummaryPill label="Reliability" value={String(data.reliability ?? "")} />
        <SummaryPill label="Data" value={String(data.dataSubject ?? "")} />
        <SummaryPill label="Event" value={String(data.eventSubject ?? "")} />
        <SummaryPill label="Status" value={String(data.status ?? "")} />
      </div>
    </div>
  )
}

function nextScanState(
  state: SemanticScanState,
  ids: string[],
  action: "intentional" | "dismiss" | "show"
): SemanticScanState {
  const idSet = new Set(ids)
  const dismissed = new Set(state.dismissedFindingIds)
  const intentional = new Set(state.intentionalFindingIds)

  if (action === "intentional") {
    ids.forEach((id) => {
      dismissed.delete(id)
      intentional.add(id)
    })
  } else if (action === "dismiss") {
    ids.forEach((id) => {
      intentional.delete(id)
      dismissed.add(id)
    })
  } else {
    for (const id of idSet) {
      dismissed.delete(id)
      intentional.delete(id)
    }
  }

  return {
    dismissedFindingIds: [...dismissed],
    intentionalFindingIds: [...intentional],
    updatedAt: new Date().toISOString(),
  }
}

function WarningList({
  warnings,
  semanticScanState,
  onSemanticScanStateChange,
  currentGraphId,
  onSendSemanticFindingToArchitect,
  showHidden = true,
}: {
  warnings: SemanticValidationResult[]
  semanticScanState: SemanticScanState
  onSemanticScanStateChange: (state: SemanticScanState) => void
  currentGraphId: string
  onSendSemanticFindingToArchitect?: (message: string) => void
  showHidden?: boolean
}) {
  const visibleWarnings = warnings.filter(
    (warning) => showHidden || !isSemanticFindingHidden(warning, semanticScanState)
  )

  if (visibleWarnings.length === 0) {
    return (
      <div className="rounded-xl border border-state-success/25 bg-bg-elevated px-2.5 py-2 text-xs text-state-success">
        Semantic metadata is complete for this selection.
      </div>
    )
  }

  const condensedWarnings = condenseWarnings(visibleWarnings)
  const hiddenCount = Math.max(0, condensedWarnings.length - 5)

  return (
    <div className="grid min-w-0 gap-1.5">
      {condensedWarnings.slice(0, 5).map((warning, index) => {
        const Icon = warning.severity === "info" ? Info : AlertTriangle
        const color =
          warning.severity === "info" ? "text-text-muted" : "text-state-warning"

        return (
          <div
            key={warning.id}
            className="group grid min-w-0 gap-2 overflow-hidden rounded-xl border border-border-default bg-bg-elevated px-2.5 py-2 text-xs text-text-secondary shadow-[0_0_0_rgba(0,0,0,0)] transition-all duration-200 ease-out motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 hover:-translate-y-0.5 hover:border-accent-primary/30 hover:bg-bg-subtle/80 hover:shadow-[0_12px_32px_rgba(0,200,212,0.08)]"
            style={{ animationDelay: `${index * 35}ms` }}
          >
            <div className="grid min-w-0 grid-cols-[auto_1fr] items-start gap-x-2">
              <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} />
              <span className="min-w-0 max-w-full whitespace-normal break-words leading-5 text-pretty">
                {warning.message}
              </span>
            </div>
            <div className="ml-5 flex min-w-0 flex-wrap items-center gap-1.5">
              {warning.count > 1 ? (
                <span className="shrink-0 rounded-full border border-state-warning/25 bg-state-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-state-warning transition-colors group-hover:border-state-warning/45 group-hover:bg-state-warning/15">
                  x{warning.count}
                </span>
              ) : null}
              {onSendSemanticFindingToArchitect ? (
                <>
                  <button
                    type="button"
                    aria-label="Ask Architect about this semantic signal"
                    title="Ask Architect about this semantic signal"
                    onClick={() =>
                      onSendSemanticFindingToArchitect(
                        semanticFindingArchitectPrompt({
                          mode: "ask",
                          graphId: currentGraphId,
                          warning,
                        })
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-accent-ai/25 px-1.5 py-0.5 text-[10px] text-accent-ai-text transition-all hover:-translate-y-0.5 hover:border-accent-ai/60 hover:bg-accent-ai/10 hover:text-text-primary"
                  >
                    <MessageSquare className="h-3 w-3" />
                    Ask
                  </button>
                  <button
                    type="button"
                    aria-label="Ask Architect to propose a canvas patch for this semantic signal"
                    title="Ask Architect to propose a canvas patch for this semantic signal"
                    onClick={() =>
                      onSendSemanticFindingToArchitect(
                        semanticFindingArchitectPrompt({
                          mode: "fix",
                          graphId: currentGraphId,
                          warning,
                        })
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-accent-primary/30 bg-accent-dim px-1.5 py-0.5 text-[10px] text-accent-primary transition-all hover:-translate-y-0.5 hover:border-accent-primary/70 hover:bg-accent-primary/15 hover:text-text-primary"
                  >
                    <Wrench className="h-3 w-3" />
                    Fix
                  </button>
                </>
              ) : null}
              {warning.severity !== "error" ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      onSemanticScanStateChange(
                        nextScanState(semanticScanState, warning.ids, "intentional")
                      )
                    }
                    className="rounded-full border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-muted transition-all hover:-translate-y-0.5 hover:border-accent-primary/50 hover:text-text-primary"
                  >
                    Mark intentional
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onSemanticScanStateChange(
                        nextScanState(semanticScanState, warning.ids, "dismiss")
                      )
                    }
                    className="rounded-full border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-muted transition-all hover:-translate-y-0.5 hover:border-accent-primary/50 hover:text-text-primary"
                  >
                    Snooze
                  </button>
                  {warning.ids.some(
                    (id) =>
                      semanticScanState.dismissedFindingIds.includes(id) ||
                      semanticScanState.intentionalFindingIds.includes(id)
                  ) ? (
                    <button
                      type="button"
                      onClick={() =>
                        onSemanticScanStateChange(
                          nextScanState(semanticScanState, warning.ids, "show")
                        )
                      }
                      className="rounded-full border border-accent-primary/25 px-1.5 py-0.5 text-[10px] text-accent-primary transition-all hover:-translate-y-0.5 hover:border-accent-primary/60"
                    >
                      Show
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        )
      })}
      {hiddenCount > 0 ? (
        <div className="rounded-xl border border-border-subtle bg-bg-subtle px-2.5 py-2 text-xs text-text-muted">
          +{hiddenCount} more semantic signal{hiddenCount === 1 ? "" : "s"}
        </div>
      ) : null}
    </div>
  )
}

function SemanticWarningBeacon({
  warnings,
  isCompactViewport,
  semanticScanState,
  onSemanticScanStateChange,
  currentGraphId,
  onSendSemanticFindingToArchitect,
}: {
  warnings: SemanticValidationResult[]
  isCompactViewport: boolean
  semanticScanState: SemanticScanState
  onSemanticScanStateChange: (state: SemanticScanState) => void
  currentGraphId: string
  onSendSemanticFindingToArchitect?: (message: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const activeWarnings = warnings.filter(
    (warning) => !isSemanticFindingHidden(warning, semanticScanState)
  )
  const hiddenWarnings = warnings.filter((warning) =>
    isSemanticFindingHidden(warning, semanticScanState)
  )
  const groupedWarnings = useMemo(
    () => groupSemanticFindings(showHidden ? warnings : activeWarnings),
    [activeWarnings, showHidden, warnings]
  )
  const actionableWarnings = activeWarnings.filter((warning) => warning.severity !== "info")
  const hasErrors = warnings.some((warning) => warning.severity === "error")
  const statusCopy =
    actionableWarnings.length > 0
      ? `${actionableWarnings.length} signal${actionableWarnings.length === 1 ? "" : "s"}`
      : "Clean"

  return (
    <aside
      className={
        isCompactViewport
          ? "pointer-events-auto fixed left-2 right-2 top-16 z-40"
          : "pointer-events-auto absolute left-4 top-16 z-20 max-w-[calc(100%-2rem)]"
      }
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label="Toggle semantic warnings"
        onClick={() => setIsOpen((current) => !current)}
        className={
          "group relative flex max-w-full items-center gap-2 overflow-hidden rounded-full border px-2.5 py-2 text-left shadow-xl backdrop-blur-xl transition-all " +
          (actionableWarnings.length > 0
            ? "border-state-warning/25 bg-bg-surface/85 shadow-[0_0_28px_rgba(234,179,8,0.12)] hover:border-state-warning/45"
            : "border-state-success/25 bg-bg-surface/80 shadow-[0_0_28px_rgba(34,197,94,0.10)] hover:border-state-success/45")
        }
        data-testid="semantic-warning-chip"
      >
        <span className="pointer-events-none absolute inset-x-3 bottom-0 h-px bg-gradient-to-r from-transparent via-accent-primary/50 to-transparent opacity-70" />
        <span
          className={
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border " +
            (actionableWarnings.length > 0
              ? "border-state-warning/30 bg-state-warning/10 text-state-warning"
              : "border-state-success/30 bg-state-success/10 text-state-success")
          }
        >
          {actionableWarnings.length > 0 ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-normal text-text-primary">
            Semantic scan
          </span>
          <span className="block truncate text-[11px] text-text-muted">
          {hasErrors ? "Needs review" : statusCopy}
            {groupedWarnings.size > 0 ? ` · ${groupedWarnings.size} grouped` : ""}
          </span>
        </span>
        <span
          className={
            "ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold " +
            (actionableWarnings.length > 0
              ? "border-state-warning/25 bg-state-warning/10 text-state-warning"
              : "border-state-success/25 bg-state-success/10 text-state-success")
          }
        >
          {activeWarnings.length}
        </span>
        <ChevronDown
          className={
            "h-3.5 w-3.5 shrink-0 text-text-muted transition-transform " +
            (isOpen ? "rotate-180" : "")
          }
        />
      </button>

      {isOpen ? (
        <div
          className="mt-2 max-h-[min(24rem,calc(100vh-9rem))] w-full max-w-96 overflow-y-auto overflow-x-hidden rounded-2xl border border-border-default bg-bg-surface/95 p-3 shadow-2xl backdrop-blur-xl"
          data-testid="semantic-warning-drawer"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-text-primary">Semantic signals</p>
            <button
              type="button"
              onClick={() => setShowHidden((current) => !current)}
              className="rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] text-text-muted transition-colors hover:text-text-primary"
            >
              {showHidden ? "Hide intentional" : `${hiddenWarnings.length} hidden`}
            </button>
          </div>
          <div className="grid min-w-0 gap-2">
            {[...groupedWarnings.entries()].map(([category, groupWarnings]) => (
              <details
                key={category}
                open={category === "safety" || groupWarnings.some((item) => item.severity === "error")}
                className="min-w-0 rounded-2xl border border-border-default bg-bg-elevated/70 p-2"
              >
                <summary className="flex min-w-0 cursor-pointer items-center justify-between gap-2 text-xs font-semibold text-text-primary">
                  <span className="min-w-0 truncate">
                    {SEMANTIC_VALIDATION_CATEGORY_LABELS[category]}
                  </span>
                  <span className="rounded-full border border-border-subtle bg-bg-subtle px-1.5 py-0.5 text-[10px] text-text-muted">
                    {groupWarnings.length}
                  </span>
                </summary>
                <div className="mt-2">
                  <WarningList
                    warnings={groupWarnings}
                    semanticScanState={semanticScanState}
                    onSemanticScanStateChange={onSemanticScanStateChange}
                    currentGraphId={currentGraphId}
                    onSendSemanticFindingToArchitect={onSendSemanticFindingToArchitect}
                    showHidden
                  />
                </div>
              </details>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  )
}

function SubcanvasNotice({
  node,
  projectId,
  currentGraphId,
  patch,
}: {
  node: CanvasNode
  projectId: string
  currentGraphId: string
  patch: (patch: Partial<CanvasNodeData>) => void
}) {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const subcanvasRef = node.data.subcanvasRef

  async function openOrCreateLayer() {
    if (subcanvasRef?.graphId) {
      router.push(`/editor/${projectId}?graphId=${encodeURIComponent(subcanvasRef.graphId)}`)
      return
    }

    setIsCreating(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/subcanvas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentGraphId: currentGraphId,
          parentNodeId: node.id,
          title: `${node.data.name || node.data.label || node.id} Layer`,
          summary: node.data.description ?? undefined,
        }),
      })

      if (!response.ok) return
      const data = (await response.json()) as {
        subcanvasRef?: NonNullable<CanvasNodeData["subcanvasRef"]>
      }
      if (!data.subcanvasRef?.graphId) return
      patch({ subcanvasRef: data.subcanvasRef })
      router.push(`/editor/${projectId}?graphId=${encodeURIComponent(data.subcanvasRef.graphId)}`)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="grid gap-2 rounded-xl border border-border-default bg-bg-elevated px-2.5 py-2 text-xs text-text-secondary">
      <span>
        {subcanvasRef?.graphId
          ? "Design layer metadata is linked."
          : "Create an inner architecture layer for this node."}
      </span>
      {subcanvasRef?.graphId ? (
        <p className="truncate font-mono text-[10px] text-text-faint">
          {subcanvasRef.graphId}
        </p>
      ) : null}
      <button
        type="button"
        onClick={openOrCreateLayer}
        disabled={isCreating}
        aria-label={subcanvasRef?.graphId ? "Open design layer" : "Create layer"}
        className="flex h-8 items-center justify-center gap-2 rounded-xl border border-accent-primary/30 bg-accent-primary/10 text-text-primary transition-colors hover:border-accent-primary/60 hover:bg-accent-primary/15 disabled:cursor-wait disabled:opacity-60"
      >
        <SquareArrowOutUpRight className="h-3.5 w-3.5" />
        {isCreating ? "Creating..." : subcanvasRef?.graphId ? "Open design layer" : "Create layer"}
      </button>
    </div>
  )
}

function NodeSpecificFields({
  node,
  patch,
}: {
  node: CanvasNode
  patch: (patch: Partial<CanvasNodeData>) => void
}) {
  const type = node.data.semanticType

  if (type === "service") {
    return (
      <>
        <DraftField label="Service kind" value={node.data.serviceKind ?? ""} onCommit={(serviceKind) => patch({ serviceKind })} />
        <DraftField label="Runtime" value={node.data.runtime ?? ""} onCommit={(runtime) => patch({ runtime })} />
        <DraftField label="Language" value={node.data.language ?? ""} onCommit={(language) => patch({ language })} />
        <DraftField label="Framework" value={node.data.framework ?? ""} onCommit={(framework) => patch({ framework })} />
        <DraftField label="Tenancy" value={node.data.tenancy ?? ""} onCommit={(tenancy) => patch({ tenancy })} />
        <DraftField label="Auth mode" value={node.data.authMode ?? ""} onCommit={(authMode) => patch({ authMode })} />
      </>
    )
  }

  if (type === "database") {
    return (
      <>
        <DraftField label="Database kind" value={node.data.dbKind ?? ""} onCommit={(dbKind) => patch({ dbKind })} />
        <DraftField label="Engine" value={node.data.engine ?? ""} onCommit={(engine) => patch({ engine })} />
        <DraftField label="ORM" value={node.data.orm ?? ""} onCommit={(orm) => patch({ orm })} />
      </>
    )
  }

  if (type === "worker") {
    return (
      <>
        <DraftField label="Trigger type" value={node.data.triggerType ?? ""} onCommit={(triggerType) => patch({ triggerType })} />
        <DraftField label="Retry policy" value={node.data.retryPolicy ?? ""} onCommit={(retryPolicy) => patch({ retryPolicy })} />
        <BooleanField label="Idempotency required" checked={Boolean(node.data.idempotencyRequired)} onChange={(idempotencyRequired) => patch({ idempotencyRequired })} />
      </>
    )
  }

  if (type === "client-surface" || type === "frontend") {
    return (
      <>
        <DraftField label="Framework" value={node.data.framework ?? ""} onCommit={(framework) => patch({ framework })} />
        <DraftField label="Auth mode" value={node.data.authMode ?? ""} onCommit={(authMode) => patch({ authMode })} />
      </>
    )
  }

  if (type === "event-channel" || type === "queue") {
    return (
      <>
        <DraftField label="Topic" value={node.data.topic ?? ""} onCommit={(topic) => patch({ topic })} />
        <DraftField label="Delivery guarantee" value={node.data.deliveryGuarantee ?? ""} onCommit={(deliveryGuarantee) => patch({ deliveryGuarantee })} />
      </>
    )
  }

  if (type === "identity-auth" || type === "auth-module") {
    return (
      <>
        <DraftField label="Auth strategy" value={node.data.authStrategy ?? ""} onCommit={(authStrategy) => patch({ authStrategy })} />
        <DraftField label="Session mode" value={node.data.sessionMode ?? ""} onCommit={(sessionMode) => patch({ sessionMode })} />
        <BooleanField label="Email verification" checked={Boolean(node.data.emailVerification)} onChange={(emailVerification) => patch({ emailVerification })} />
      </>
    )
  }

  if (type === "endpoint") {
    return (
      <>
        <DraftField label="Method" value={node.data.method ?? ""} onCommit={(method) => patch({ method })} />
        <DraftField label="Path" value={node.data.path ?? ""} onCommit={(path) => patch({ path })} />
        <BooleanField label="Auth required" checked={Boolean(node.data.authRequired)} onChange={(authRequired) => patch({ authRequired })} />
        <BooleanField label="Idempotent" checked={Boolean(node.data.idempotent)} onChange={(idempotent) => patch({ idempotent })} />
      </>
    )
  }

  if (type === "entity") {
    return (
      <>
        <ListField label="Fields" values={toList(node.data.fields)} onCommit={(fields) => patch({ fields })} />
        <DraftField label="Tenant key" value={node.data.tenantKey ?? ""} onCommit={(tenantKey) => patch({ tenantKey })} />
      </>
    )
  }

  if (type === "event-contract") {
    return (
      <>
        <DraftField label="Direction" value={node.data.direction ?? ""} onCommit={(direction) => patch({ direction })} />
        <DraftField label="Topic" value={node.data.topic ?? ""} onCommit={(topic) => patch({ topic })} />
        <DraftField label="Delivery guarantee" value={node.data.deliveryGuarantee ?? ""} onCommit={(deliveryGuarantee) => patch({ deliveryGuarantee })} />
      </>
    )
  }

  if (type === "business-rule") {
    return (
      <DraftField label="Rule type" value={node.data.ruleType ?? ""} onCommit={(ruleType) => patch({ ruleType })} />
    )
  }

  if (type === "validation-rule") {
    return (
      <>
        <DraftField label="Validation scope" value={node.data.validationScope ?? ""} onCommit={(validationScope) => patch({ validationScope })} />
        <DraftField label="Severity" value={node.data.severity ?? ""} onCommit={(severity) => patch({ severity })} />
      </>
    )
  }

  if (type === "policy") {
    return (
      <>
        <DraftField label="Policy kind" value={node.data.policyKind ?? ""} onCommit={(policyKind) => patch({ policyKind })} />
        <DraftField label="Enforcement mode" value={node.data.enforcementMode ?? ""} onCommit={(enforcementMode) => patch({ enforcementMode })} />
        <BooleanField label="Audit required" checked={Boolean(node.data.auditRequired)} onChange={(auditRequired) => patch({ auditRequired })} />
      </>
    )
  }

  if (type === "runtime-deployment") {
    return (
      <>
        <DraftField label="Runtime kind" value={node.data.runtimeKind ?? ""} onCommit={(runtimeKind) => patch({ runtimeKind })} />
        <DraftField label="Environment" value={node.data.environment ?? ""} onCommit={(environment) => patch({ environment })} />
        <DraftField label="Region" value={node.data.region ?? ""} onCommit={(region) => patch({ region })} />
        <DraftField label="Scaling notes" value={node.data.scalingNotes ?? ""} onCommit={(scalingNotes) => patch({ scalingNotes })} multiline />
      </>
    )
  }

  if (type === "observability-control") {
    return (
      <>
        <ListField label="Signal types" values={toList(node.data.signalTypes)} onCommit={(signalTypes) => patch({ signalTypes })} />
        <DraftField label="Retention notes" value={node.data.retentionNotes ?? ""} onCommit={(retentionNotes) => patch({ retentionNotes })} multiline />
        <DraftField label="Incident notes" value={node.data.incidentNotes ?? ""} onCommit={(incidentNotes) => patch({ incidentNotes })} multiline />
      </>
    )
  }

  if (type === "ai-component") {
    return (
      <>
        <DraftField label="AI role" value={node.data.aiRole ?? ""} onCommit={(aiRole) => patch({ aiRole })} />
        <DraftField label="Model provider" value={node.data.modelProvider ?? ""} onCommit={(modelProvider) => patch({ modelProvider })} />
        <DraftField label="Model class" value={node.data.modelClass ?? ""} onCommit={(modelClass) => patch({ modelClass })} />
        <ListField label="Tool access" values={toList(node.data.toolAccess)} onCommit={(toolAccess) => patch({ toolAccess })} />
        <DraftField label="Retrieval notes" value={node.data.retrievalNotes ?? ""} onCommit={(retrievalNotes) => patch({ retrievalNotes })} multiline />
        <DraftField label="Cost notes" value={node.data.costNotes ?? ""} onCommit={(costNotes) => patch({ costNotes })} multiline />
      </>
    )
  }

  return null
}

export function SemanticInspector({
  projectId,
  currentGraphId,
  selectedNode,
  selectedEdge,
  warnings,
  semanticScanState,
  onSemanticScanStateChange,
  onSendSemanticFindingToArchitect,
}: SemanticInspectorProps) {
  const { updateNodeData, updateEdgeData } = useCanvasMutations()
  const router = useRouter()
  const [isCompactViewport, setIsCompactViewport] = useState(false)
  const selectionWarnings = useMemo(() => {
    const targetId = selectedNode?.id ?? selectedEdge?.id
    return targetId
      ? warnings.filter((warning) => warning.targetId === targetId)
      : warnings.filter((warning) => warning.severity !== "info")
  }, [selectedEdge?.id, selectedNode?.id, warnings])

  useEffect(() => {
    function updateCompactViewport() {
      setIsCompactViewport(window.innerWidth < 1024)
    }

    updateCompactViewport()
    window.addEventListener("resize", updateCompactViewport)

    return () => window.removeEventListener("resize", updateCompactViewport)
  }, [])

  const compactPanelClassName =
    "pointer-events-auto fixed left-2 right-2 top-16 z-40 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl border border-border-default bg-bg-surface/95 p-3 shadow-xl backdrop-blur-xl"
  const desktopPanelClassName =
    "pointer-events-auto absolute left-4 top-16 z-20 max-h-[calc(100%-5rem)] w-80 overflow-y-auto rounded-2xl border border-border-default bg-bg-surface/95 p-3 shadow-xl backdrop-blur-xl"
  const inspectorPanelClassName = isCompactViewport
    ? compactPanelClassName
    : desktopPanelClassName

  if (!selectedNode && !selectedEdge) {
    if (warnings.length === 0) return null

    return (
      <SemanticWarningBeacon
        warnings={selectionWarnings}
        isCompactViewport={isCompactViewport}
        semanticScanState={semanticScanState}
        onSemanticScanStateChange={onSemanticScanStateChange}
        currentGraphId={currentGraphId}
        onSendSemanticFindingToArchitect={onSendSemanticFindingToArchitect}
      />
    )
  }

  if (selectedNode) {
    const semanticType = selectedNode.data.semanticType ?? "unclassified"
    const hasProxyMetadata =
      semanticType === "reference-proxy" ||
      Boolean(
        selectedNode.data.referencedGraphId ||
          selectedNode.data.referencedNodeId ||
          selectedNode.data.referencedEdgeId
      )
    const patch = (nextPatch: Partial<CanvasNodeData>) =>
      updateNodeData(selectedNode.id, nextPatch)

    return (
      <aside className={inspectorPanelClassName}>
        <div className="mb-3">
          <p className="text-xs font-semibold text-text-primary">Semantic Inspector</p>
          <p className="truncate text-[11px] text-text-muted">{selectedNode.id}</p>
        </div>
        <div className="grid gap-2">
          <InspectorSection title="Overview" defaultOpen>
            <WarningList
              warnings={selectionWarnings}
              semanticScanState={semanticScanState}
              onSemanticScanStateChange={onSemanticScanStateChange}
              currentGraphId={currentGraphId}
              onSendSemanticFindingToArchitect={onSendSemanticFindingToArchitect}
            />
            <NodeSummaryCard node={selectedNode} />
            <SelectField<SemanticNodeType>
              label="Node type"
              value={semanticType}
              options={NODE_TYPE_OPTIONS}
              optionLabel={semanticNodeTypeLabel}
              onChange={(nextType) =>
                patch({
                  ...semanticDefaultsForType(nextType),
                  name:
                    selectedNode.data.name ||
                    selectedNode.data.label ||
                    semanticNodeTypeLabel(nextType),
                })
              }
            />
            <DraftField label="Name" value={selectedNode.data.name ?? ""} onCommit={(name) => patch({ name })} />
            <DraftField label="Label" value={selectedNode.data.label ?? ""} onCommit={(label) => patch({ label })} />
            <DraftField label="Description" value={selectedNode.data.description ?? ""} onCommit={(description) => patch({ description })} multiline />
            <ListField label="Responsibilities" values={toList(selectedNode.data.responsibilities)} onCommit={(responsibilities) => patch({ responsibilities })} />
            <DraftField label="Owner" value={selectedNode.data.owner ?? ""} onCommit={(owner) => patch({ owner: owner || null })} />
            <DraftField label="Boundary" value={selectedNode.data.boundary ?? ""} onCommit={(boundary) => patch({ boundary })} />
            <DraftField label="Trust zone" value={selectedNode.data.trustZone ?? ""} onCommit={(trustZone) => patch({ trustZone })} />
            <DraftField label="Layer role" value={selectedNode.data.layerRole ?? ""} onCommit={(layerRole) => patch({ layerRole })} />
            <SelectField
              label="Status"
              value={selectedNode.data.status ?? "draft"}
              options={["draft", "approved", "deprecated"] as const}
              optionLabel={(value) => value}
              onChange={(status) => patch({ status })}
            />
            <DraftField label="Maturity" value={String(selectedNode.data.maturity ?? selectedNode.data.status ?? "draft")} onCommit={(maturity) => patch({ maturity })} />
            <ListField label="Tags" values={toList(selectedNode.data.tags)} onCommit={(tags) => patch({ tags })} />
          </InspectorSection>

          <InspectorSection title="Interfaces">
            <ListField label="Interfaces exposed" values={toList(selectedNode.data.interfacesExposed)} onCommit={(interfacesExposed) => patch({ interfacesExposed })} />
            <ListField label="Interfaces consumed" values={toList(selectedNode.data.interfacesConsumed)} onCommit={(interfacesConsumed) => patch({ interfacesConsumed })} />
            <DraftField label="Interface notes" value={selectedNode.data.interfaceNotes ?? ""} onCommit={(interfaceNotes) => patch({ interfaceNotes })} multiline />
            <NodeSpecificFields node={selectedNode} patch={patch} />
          </InspectorSection>

          <InspectorSection title="Data">
            <ListField label="Data owned" values={toList(selectedNode.data.dataOwned)} onCommit={(dataOwned) => patch({ dataOwned })} />
            <ListField label="Data read" values={toList(selectedNode.data.dataRead)} onCommit={(dataRead) => patch({ dataRead })} />
            <SelectField
              label="Data sensitivity"
              value={(selectedNode.data.dataSensitivity ?? "unknown") as (typeof DATA_SENSITIVITY_OPTIONS)[number]}
              options={DATA_SENSITIVITY_OPTIONS}
              optionLabel={(value) => value}
              onChange={(dataSensitivity) => patch({ dataSensitivity })}
            />
            <DraftField label="Privacy class" value={selectedNode.data.privacyClass ?? ""} onCommit={(privacyClass) => patch({ privacyClass })} />
            <DraftField label="Retention notes" value={selectedNode.data.retentionNotes ?? ""} onCommit={(retentionNotes) => patch({ retentionNotes })} multiline />
            <DraftField label="Backup notes" value={selectedNode.data.backupNotes ?? ""} onCommit={(backupNotes) => patch({ backupNotes })} multiline />
          </InspectorSection>

          <InspectorSection title="Events">
            <ListField label="Events emitted" values={toList(selectedNode.data.eventsEmitted)} onCommit={(eventsEmitted) => patch({ eventsEmitted })} />
            <ListField label="Events consumed" values={toList(selectedNode.data.eventsConsumed)} onCommit={(eventsConsumed) => patch({ eventsConsumed })} />
            <DraftField label="Event notes" value={selectedNode.data.eventNotes ?? ""} onCommit={(eventNotes) => patch({ eventNotes })} multiline />
          </InspectorSection>

          <InspectorSection title="Security">
            <SelectField
              label="Exposure"
              value={(selectedNode.data.exposure ?? "unknown") as (typeof EXPOSURE_OPTIONS)[number]}
              options={EXPOSURE_OPTIONS}
              optionLabel={(value) => value}
              onChange={(exposure) => patch({ exposure })}
            />
            <DraftField label="Auth expectation" value={selectedNode.data.authExpectation ?? ""} onCommit={(authExpectation) => patch({ authExpectation })} multiline />
            <DraftField label="Security notes" value={selectedNode.data.securityNotes ?? ""} onCommit={(securityNotes) => patch({ securityNotes })} multiline />
            <DraftField label="Trust notes" value={selectedNode.data.trustNotes ?? ""} onCommit={(trustNotes) => patch({ trustNotes })} multiline />
            <DraftField label="Safety notes" value={selectedNode.data.safetyNotes ?? ""} onCommit={(safetyNotes) => patch({ safetyNotes })} multiline />
            <DraftField label="Secret ref" value={selectedNode.data.secretRef ?? ""} onCommit={(secretRef) => patch({ secretRef })} />
            <DraftField label="Secret capability ref" value={selectedNode.data.secretCapabilityRef ?? ""} onCommit={(secretCapabilityRef) => patch({ secretCapabilityRef })} />
          </InspectorSection>

          <InspectorSection title="Operations">
            <DraftField label="Technology" value={selectedNode.data.technology ?? ""} onCommit={(technology) => patch({ technology })} />
            <DraftField label="Runtime kind" value={selectedNode.data.runtimeKind ?? ""} onCommit={(runtimeKind) => patch({ runtimeKind })} />
            <DraftField label="Environment" value={selectedNode.data.environment ?? ""} onCommit={(environment) => patch({ environment })} />
            <DraftField label="Region" value={selectedNode.data.region ?? ""} onCommit={(region) => patch({ region })} />
            <DraftField label="Operational notes" value={selectedNode.data.operationalNotes ?? ""} onCommit={(operationalNotes) => patch({ operationalNotes })} multiline />
            <DraftField label="Scaling notes" value={selectedNode.data.scalingNotes ?? ""} onCommit={(scalingNotes) => patch({ scalingNotes })} multiline />
            <DraftField label="Observability notes" value={selectedNode.data.observabilityNotes ?? ""} onCommit={(observabilityNotes) => patch({ observabilityNotes })} multiline />
            <ListField label="Signal types" values={toList(selectedNode.data.signalTypes)} onCommit={(signalTypes) => patch({ signalTypes })} />
            <DraftField label="Incident notes" value={selectedNode.data.incidentNotes ?? ""} onCommit={(incidentNotes) => patch({ incidentNotes })} multiline />
            <ListField label="Failure modes" values={toList(selectedNode.data.failureModes)} onCommit={(failureModes) => patch({ failureModes })} />
          </InspectorSection>

          {hasProxyMetadata ? (
            <InspectorSection title="Reference Proxy" defaultOpen={semanticType === "reference-proxy"}>
              <SelectField
                label="Reference kind"
                value={(selectedNode.data.referenceKind ?? "node") as (typeof REFERENCE_KIND_OPTIONS)[number]}
                options={REFERENCE_KIND_OPTIONS}
                optionLabel={(value) => value}
                onChange={(referenceKind) => patch({ referenceKind })}
              />
              <DraftField label="Referenced graph" value={selectedNode.data.referencedGraphId ?? ""} onCommit={(referencedGraphId) => patch({ referencedGraphId })} />
              <DraftField label="Referenced node" value={selectedNode.data.referencedNodeId ?? ""} onCommit={(referencedNodeId) => patch({ referencedNodeId })} />
              <DraftField label="Referenced edge" value={selectedNode.data.referencedEdgeId ?? ""} onCommit={(referencedEdgeId) => patch({ referencedEdgeId })} />
              <DraftField label="Referenced label" value={selectedNode.data.referencedLabel ?? ""} onCommit={(referencedLabel) => patch({ referencedLabel })} />
              <DraftField label="Reference role" value={selectedNode.data.referenceRole ?? ""} onCommit={(referenceRole) => patch({ referenceRole })} />
              <SelectField
                label="Proxy direction"
                value={(selectedNode.data.proxyDirection ?? "context") as (typeof PROXY_DIRECTION_OPTIONS)[number]}
                options={PROXY_DIRECTION_OPTIONS}
                optionLabel={(value) => value}
                onChange={(proxyDirection) => patch({ proxyDirection })}
              />
              <DraftField label="Reference notes" value={selectedNode.data.referenceNotes ?? ""} onCommit={(referenceNotes) => patch({ referenceNotes })} multiline />
              {selectedNode.data.referencedGraphId ? (
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/editor/${projectId}?graphId=${encodeURIComponent(selectedNode.data.referencedGraphId ?? "")}`)
                  }
                  className="flex h-8 items-center justify-center gap-2 rounded-xl border border-accent-primary/30 bg-accent-primary/10 text-xs text-text-primary transition-colors hover:border-accent-primary/60 hover:bg-accent-primary/15"
                >
                  <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                  Open referenced layer
                </button>
              ) : null}
            </InspectorSection>
          ) : null}

          <InspectorSection title="Prompt Pack Notes">
            <DraftField label="Prompt Pack notes" value={selectedNode.data.promptPackNotes ?? ""} onCommit={(promptPackNotes) => patch({ promptPackNotes })} multiline />
            <ListField label="Source refs" values={toList(selectedNode.data.sourceRefs)} onCommit={(sourceRefs) => patch({ sourceRefs })} />
            <ListField label="Assumptions" values={toList(selectedNode.data.assumptions)} onCommit={(assumptions) => patch({ assumptions })} />
            <ListField label="Decision refs" values={toList(selectedNode.data.decisionRefs)} onCommit={(decisionRefs) => patch({ decisionRefs })} />
          </InspectorSection>

          <InspectorSection title="Open Questions">
            {toList(selectedNode.data.openQuestions).length === 0 ? (
              <EmptySectionNote label="open questions" />
            ) : null}
            <ListField label="Open questions" values={toList(selectedNode.data.openQuestions)} onCommit={(openQuestions) => patch({ openQuestions })} />
          </InspectorSection>

          <InspectorSection title="Child Layer">
            <DraftField label="Child layer purpose" value={selectedNode.data.childLayerPurpose ?? ""} onCommit={(childLayerPurpose) => patch({ childLayerPurpose })} />
            <DraftField label="Child layer summary" value={selectedNode.data.childLayerSummary ?? ""} onCommit={(childLayerSummary) => patch({ childLayerSummary })} multiline />
            <DraftField label="Last layer summary" value={selectedNode.data.lastLayerSummary ?? ""} onCommit={(lastLayerSummary) => patch({ lastLayerSummary })} multiline />
            <SelectField<CanvasDecompositionStatus>
              label="Decomposition status"
              value={selectedNode.data.decompositionStatus ?? "none"}
              options={DECOMPOSITION_STATUS_OPTIONS}
              optionLabel={(value) => value}
              onChange={(decompositionStatus) => patch({ decompositionStatus })}
            />
            <SubcanvasNotice
              node={selectedNode}
              projectId={projectId}
              currentGraphId={currentGraphId}
              patch={patch}
            />
          </InspectorSection>
        </div>
      </aside>
    )
  }

  if (selectedEdge) {
    const edgeData = selectedEdge.data ?? {}
    const relationshipType =
      normalizeEdgeRelationshipType(edgeData.relationshipType ?? edgeData.semanticType) ??
      "depends_on"
    const patch = (nextPatch: Partial<CanvasEdgeData>) =>
      updateEdgeData(selectedEdge.id, nextPatch)
    const edgeLabels = edgeLabelTexts(edgeData)
    const commitEdgeLabels = (labels: string[]) => {
      const previousItems = normalizeEdgeLabelItems(edgeData)
      patch(mirrorEdgeLabelData(createEdgeLabelItems(labels, previousItems, `${selectedEdge.id}-label`)))
    }

    return (
      <aside className={inspectorPanelClassName}>
        <div className="mb-3">
          <p className="text-xs font-semibold text-text-primary">Semantic Inspector</p>
          <p className="truncate text-[11px] text-text-muted">{selectedEdge.id}</p>
        </div>
        <div className="grid gap-2">
          <InspectorSection title="Overview" defaultOpen>
            <WarningList
              warnings={selectionWarnings}
              semanticScanState={semanticScanState}
              onSemanticScanStateChange={onSemanticScanStateChange}
              currentGraphId={currentGraphId}
              onSendSemanticFindingToArchitect={onSendSemanticFindingToArchitect}
            />
            <EdgeSummaryCard edge={selectedEdge} />
            <SelectField<EdgeRelationshipType>
              label="Relationship type"
              value={relationshipType}
              options={RELATIONSHIP_TYPE_OPTIONS}
              optionLabel={edgeRelationshipTypeLabel}
              onChange={(nextType) => patch({ relationshipType: nextType, semanticType: nextType })}
            />
            <DraftField label="Name" value={edgeData.name ?? ""} onCommit={(name) => patch({ name })} />
            <DraftField
              label="Primary label"
              value={edgeLabels[0] ?? ""}
              onCommit={(label) => {
                const nextLabels = label ? [label, ...edgeLabels.slice(1)] : edgeLabels.slice(1)
                commitEdgeLabels(nextLabels)
              }}
            />
            <ListField label="Additional labels" values={edgeLabels.slice(1)} onCommit={(labels) => commitEdgeLabels([edgeLabels[0] ?? "", ...labels].filter(Boolean))} />
            <DraftField label="Description" value={edgeData.description ?? ""} onCommit={(description) => patch({ description })} multiline />
            <SelectField
              label="Status"
              value={edgeData.status ?? "draft"}
              options={["draft", "approved", "deprecated"] as const}
              optionLabel={(value) => value}
              onChange={(status) => patch({ status })}
            />
            <ListField label="Tags" values={toList(edgeData.tags)} onCommit={(tags) => patch({ tags })} />
          </InspectorSection>

          <InspectorSection title="Mechanism">
            <DraftField label="Mechanism" value={String(edgeData.mechanism ?? "")} onCommit={(mechanism) => patch({ mechanism })} />
            <DraftField label="Protocol" value={String(edgeData.protocol ?? "")} onCommit={(protocol) => patch({ protocol })} />
            <SelectField
              label="Sync mode"
              value={edgeData.syncMode ?? "unknown"}
              options={["sync", "async", "unknown"] as const}
              optionLabel={(value) => value}
              onChange={(syncMode) => patch({ syncMode })}
            />
            <DraftField label="Method" value={String(edgeData.method ?? "")} onCommit={(method) => patch({ method })} />
            <DraftField label="Path" value={String(edgeData.path ?? "")} onCommit={(path) => patch({ path })} />
            <DraftField label="Operation hint" value={String(edgeData.operationHint ?? "")} onCommit={(operationHint) => patch({ operationHint })} />
          </InspectorSection>

          <InspectorSection title="Reliability">
            <SelectField
              label="Criticality"
              value={(edgeData.criticality ?? "medium") as (typeof RELATIONSHIP_CRITICALITY_OPTIONS)[number]}
              options={RELATIONSHIP_CRITICALITY_OPTIONS}
              optionLabel={(value) => value}
              onChange={(criticality) => patch({ criticality })}
            />
            <SelectField
              label="Directionality"
              value={(edgeData.directionality ?? "directed") as (typeof RELATIONSHIP_DIRECTIONALITY_OPTIONS)[number]}
              options={RELATIONSHIP_DIRECTIONALITY_OPTIONS}
              optionLabel={(value) => value}
              onChange={(directionality) => patch({ directionality })}
            />
            <DraftField label="Reliability" value={String(edgeData.reliability ?? "")} onCommit={(reliability) => patch({ reliability })} multiline />
            <DraftField label="Retry policy" value={String(edgeData.retryPolicy ?? "")} onCommit={(retryPolicy) => patch({ retryPolicy })} multiline />
            <DraftField label="Idempotency notes" value={String(edgeData.idempotencyNotes ?? "")} onCommit={(idempotencyNotes) => patch({ idempotencyNotes })} multiline />
            <DraftField label="Consistency" value={String(edgeData.consistency ?? "")} onCommit={(consistency) => patch({ consistency })} multiline />
            <DraftField label="Rate limit notes" value={String(edgeData.rateLimitNotes ?? "")} onCommit={(rateLimitNotes) => patch({ rateLimitNotes })} multiline />
            <DraftField label="Timeout notes" value={String(edgeData.timeoutNotes ?? "")} onCommit={(timeoutNotes) => patch({ timeoutNotes })} multiline />
            <DraftField label="Fallback notes" value={String(edgeData.fallbackNotes ?? "")} onCommit={(fallbackNotes) => patch({ fallbackNotes })} multiline />
            <DraftField label="Ownership notes" value={String(edgeData.ownershipNotes ?? "")} onCommit={(ownershipNotes) => patch({ ownershipNotes })} multiline />
          </InspectorSection>

          <InspectorSection title="Data / Events">
            <DraftField label="Data subject" value={String(edgeData.dataSubject ?? "")} onCommit={(dataSubject) => patch({ dataSubject })} />
            <DraftField label="Event subject" value={String(edgeData.eventSubject ?? "")} onCommit={(eventSubject) => patch({ eventSubject })} />
            <DraftField label="Event name" value={String(edgeData.eventName ?? "")} onCommit={(eventName) => patch({ eventName })} />
            <DraftField label="Topic" value={String(edgeData.topic ?? "")} onCommit={(topic) => patch({ topic })} />
          </InspectorSection>

          <InspectorSection title="Security / Trust">
            <DraftField label="Auth" value={String(edgeData.auth ?? "")} onCommit={(auth) => patch({ auth })} />
            <DraftField label="Security notes" value={String(edgeData.securityNotes ?? "")} onCommit={(securityNotes) => patch({ securityNotes })} multiline />
            <DraftField label="Trust notes" value={String(edgeData.trustNotes ?? "")} onCommit={(trustNotes) => patch({ trustNotes })} multiline />
          </InspectorSection>

          <InspectorSection title="Notes">
            <ListField label="Source refs" values={toList(edgeData.sourceRefs)} onCommit={(sourceRefs) => patch({ sourceRefs })} />
            <ListField label="Assumptions" values={toList(edgeData.assumptions)} onCommit={(assumptions) => patch({ assumptions })} />
            <ListField label="Decision refs" values={toList(edgeData.decisionRefs)} onCommit={(decisionRefs) => patch({ decisionRefs })} />
          </InspectorSection>
        </div>
      </aside>
    )
  }

  return null
}
