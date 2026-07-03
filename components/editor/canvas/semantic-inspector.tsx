"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Info,
  SquareArrowOutUpRight,
} from "lucide-react"
import type {
  CanvasEdge,
  CanvasEdgeData,
  CanvasNode,
  CanvasNodeData,
  SemanticEdgeType,
  SemanticNodeType,
} from "@/types/canvas"
import {
  SEMANTIC_EDGE_TYPES,
  SEMANTIC_NODE_TYPES,
  semanticEdgeTypeLabel,
  semanticNodeTypeLabel,
} from "@/types/canvas"
import { semanticDefaultsForType } from "@/lib/canvas/semantic-defaults"
import type { SemanticValidationResult } from "@/lib/canvas/semantic-validation"
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
}

interface DraftFieldProps {
  label: string
  value: string
  onCommit: (value: string) => void
  multiline?: boolean
}

interface CondensedWarning {
  id: string
  message: string
  severity: SemanticValidationResult["severity"]
  count: number
}

function toList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : []
}

function condenseWarnings(warnings: SemanticValidationResult[]): CondensedWarning[] {
  const byMessage = new Map<string, CondensedWarning>()

  for (const warning of warnings) {
    const key = `${warning.severity}:${warning.message}`
    const current = byMessage.get(key)
    if (current) {
      current.count += 1
    } else {
      byMessage.set(key, {
        id: warning.id,
        message: warning.message,
        severity: warning.severity,
        count: 1,
      })
    }
  }

  const rank = { error: 0, warning: 1, info: 2 } as const
  return [...byMessage.values()].sort(
    (a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count
  )
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

function WarningList({ warnings }: { warnings: SemanticValidationResult[] }) {
  if (warnings.length === 0) {
    return (
      <div className="rounded-xl border border-state-success/25 bg-bg-elevated px-2.5 py-2 text-xs text-state-success">
        Semantic metadata is complete for this selection.
      </div>
    )
  }

  const condensedWarnings = condenseWarnings(warnings)
  const hiddenCount = Math.max(0, condensedWarnings.length - 5)

  return (
    <div className="grid gap-1.5">
      {condensedWarnings.slice(0, 5).map((warning) => {
        const Icon = warning.severity === "info" ? Info : AlertTriangle
        const color =
          warning.severity === "info" ? "text-text-muted" : "text-state-warning"

        return (
          <div
            key={warning.id}
            className="flex items-start gap-2 rounded-xl border border-border-default bg-bg-elevated px-2.5 py-2 text-xs text-text-secondary"
          >
            <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} />
            <span className="min-w-0 flex-1">{warning.message}</span>
            {warning.count > 1 ? (
              <span className="shrink-0 rounded-full border border-border-subtle bg-bg-subtle px-1.5 py-0.5 text-[10px] text-text-muted">
                x{warning.count}
              </span>
            ) : null}
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
}: {
  warnings: SemanticValidationResult[]
  isCompactViewport: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const condensedWarnings = useMemo(() => condenseWarnings(warnings), [warnings])
  const actionableWarnings = warnings.filter((warning) => warning.severity !== "info")
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
            {condensedWarnings.length > 0 ? ` · ${condensedWarnings.length} grouped` : ""}
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
          {warnings.length}
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
          className="mt-2 max-h-[min(22rem,calc(100vh-9rem))] w-full max-w-80 overflow-y-auto rounded-2xl border border-border-default bg-bg-surface/95 p-3 shadow-2xl backdrop-blur-xl"
          data-testid="semantic-warning-drawer"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-text-primary">Semantic signals</p>
            <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] text-text-muted">
              {warnings.length}
            </span>
          </div>
          <WarningList warnings={warnings} />
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

  if (type === "auth-module") {
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

  return null
}

export function SemanticInspector({
  projectId,
  currentGraphId,
  selectedNode,
  selectedEdge,
  warnings,
}: SemanticInspectorProps) {
  const { updateNodeData, updateEdgeData } = useCanvasMutations()
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
      />
    )
  }

  if (selectedNode) {
    const semanticType = selectedNode.data.semanticType ?? "unclassified"
    const patch = (nextPatch: Partial<CanvasNodeData>) =>
      updateNodeData(selectedNode.id, nextPatch)

    return (
      <aside className={inspectorPanelClassName}>
        <div className="mb-3">
          <p className="text-xs font-semibold text-text-primary">Semantic Inspector</p>
          <p className="truncate text-[11px] text-text-muted">{selectedNode.id}</p>
        </div>
        <div className="grid gap-2">
          <WarningList warnings={selectionWarnings} />
          <SelectField<SemanticNodeType>
            label="Node type"
            value={semanticType}
            options={SEMANTIC_NODE_TYPES}
            optionLabel={semanticNodeTypeLabel}
            onChange={(nextType) =>
              patch({
                ...semanticDefaultsForType(nextType),
                name: selectedNode.data.name || selectedNode.data.label || semanticNodeTypeLabel(nextType),
              })
            }
          />
          <DraftField label="Name" value={selectedNode.data.name ?? ""} onCommit={(name) => patch({ name })} />
          <DraftField label="Label" value={selectedNode.data.label ?? ""} onCommit={(label) => patch({ label })} />
          <DraftField label="Description" value={selectedNode.data.description ?? ""} onCommit={(description) => patch({ description })} multiline />
          <SelectField
            label="Status"
            value={selectedNode.data.status ?? "draft"}
            options={["draft", "approved", "deprecated"] as const}
            optionLabel={(value) => value}
            onChange={(status) => patch({ status })}
          />
          <ListField label="Tags" values={toList(selectedNode.data.tags)} onCommit={(tags) => patch({ tags })} />
          <DraftField label="Owner" value={selectedNode.data.owner ?? ""} onCommit={(owner) => patch({ owner: owner || null })} />
          <ListField label="Source refs" values={toList(selectedNode.data.sourceRefs)} onCommit={(sourceRefs) => patch({ sourceRefs })} />
          <ListField label="Assumptions" values={toList(selectedNode.data.assumptions)} onCommit={(assumptions) => patch({ assumptions })} />
          <ListField label="Decision refs" values={toList(selectedNode.data.decisionRefs)} onCommit={(decisionRefs) => patch({ decisionRefs })} />
          <NodeSpecificFields node={selectedNode} patch={patch} />
          <SubcanvasNotice
            node={selectedNode}
            projectId={projectId}
            currentGraphId={currentGraphId}
            patch={patch}
          />
        </div>
      </aside>
    )
  }

  if (selectedEdge) {
    const edgeData = selectedEdge.data ?? {}
    const semanticType = edgeData.semanticType ?? "unclassified"
    const patch = (nextPatch: Partial<CanvasEdgeData>) =>
      updateEdgeData(selectedEdge.id, nextPatch)
    const edgeLabels = edgeLabelTexts(edgeData)

    return (
      <aside className={inspectorPanelClassName}>
        <div className="mb-3">
          <p className="text-xs font-semibold text-text-primary">Semantic Inspector</p>
          <p className="truncate text-[11px] text-text-muted">{selectedEdge.id}</p>
        </div>
        <div className="grid gap-2">
          <WarningList warnings={selectionWarnings} />
          <SelectField<SemanticEdgeType>
            label="Edge type"
            value={semanticType}
            options={SEMANTIC_EDGE_TYPES}
            optionLabel={semanticEdgeTypeLabel}
            onChange={(nextType) => patch({ semanticType: nextType })}
          />
          <DraftField label="Name" value={edgeData.name ?? ""} onCommit={(name) => patch({ name })} />
          <DraftField
            label="Primary label"
            value={edgeLabels[0] ?? ""}
            onCommit={(label) => {
              const previousItems = normalizeEdgeLabelItems(edgeData)
              const nextLabels = label
                ? [label, ...edgeLabels.slice(1)]
                : edgeLabels.slice(1)
              patch(mirrorEdgeLabelData(createEdgeLabelItems(nextLabels, previousItems, `${selectedEdge.id}-label`)))
            }}
          />
          <DraftField label="Description" value={edgeData.description ?? ""} onCommit={(description) => patch({ description })} multiline />
          <SelectField
            label="Status"
            value={edgeData.status ?? "draft"}
            options={["draft", "approved", "deprecated"] as const}
            optionLabel={(value) => value}
            onChange={(status) => patch({ status })}
          />
          <ListField label="Tags" values={toList(edgeData.tags)} onCommit={(tags) => patch({ tags })} />
          <DraftField label="Method" value={String(edgeData.method ?? "")} onCommit={(method) => patch({ method })} />
          <DraftField label="Path" value={String(edgeData.path ?? "")} onCommit={(path) => patch({ path })} />
          <DraftField label="Operation hint" value={String(edgeData.operationHint ?? "")} onCommit={(operationHint) => patch({ operationHint })} />
          <DraftField label="Event name" value={String(edgeData.eventName ?? "")} onCommit={(eventName) => patch({ eventName })} />
          <DraftField label="Topic" value={String(edgeData.topic ?? "")} onCommit={(topic) => patch({ topic })} />
          <ListField label="Source refs" values={toList(edgeData.sourceRefs)} onCommit={(sourceRefs) => patch({ sourceRefs })} />
          <ListField label="Assumptions" values={toList(edgeData.assumptions)} onCommit={(assumptions) => patch({ assumptions })} />
          <ListField label="Decision refs" values={toList(edgeData.decisionRefs)} onCommit={(decisionRefs) => patch({ decisionRefs })} />
        </div>
      </aside>
    )
  }

  return null
}
