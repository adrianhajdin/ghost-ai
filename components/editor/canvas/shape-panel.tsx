"use client"

import { useState } from "react"
import {
  Archive,
  Boxes,
  Braces,
  ChevronDown,
  Circle,
  Component,
  Cylinder,
  Database,
  Diamond,
  FileCheck,
  GitBranch,
  HardDrive,
  Hexagon,
  InspectionPanel,
  Landmark,
  Layers,
  Link2,
  MoreHorizontal,
  MousePointer2,
  PanelTopOpen,
  Pill,
  RectangleHorizontal,
  Route,
  Server,
  ShieldCheck,
  StickyNote,
  UserRound,
  Workflow,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  ADVANCED_EDGE_RELATIONSHIP_TYPES,
  NODE_SHAPES,
  SHAPE_DEFAULTS,
  NODE_COLORS,
  QUICK_EDGE_RELATIONSHIP_TYPES,
  edgeRelationshipTypeLabel,
  type CanvasNode,
  type CanvasNodeData,
  type EdgeRelationshipType,
  type NodeShape,
} from "@/types/canvas"
import {
  SEMANTIC_NODE_TEMPLATES,
  SERVICE_INTERNAL_NODE_TEMPLATES,
  semanticTemplateSize,
  type SemanticNodeTemplate,
} from "@/lib/canvas/semantic-defaults"
import type { CanvasScopeKind } from "@/lib/canvas/canvas-doc"

type ToolbarMode =
  | "select"
  | "semantic-node"
  | "relationship"
  | "drilldown"
  | "metadata"
  | "annotate"

const SHAPE_ICONS: Record<NodeShape, LucideIcon> = {
  rectangle: RectangleHorizontal,
  diamond: Diamond,
  circle: Circle,
  pill: Pill,
  cylinder: Cylinder,
  hexagon: Hexagon,
}

const SEMANTIC_TEMPLATE_ICONS: Record<SemanticNodeTemplate["semanticType"], LucideIcon> = {
  actor: UserRound,
  "client-surface": PanelTopOpen,
  service: Server,
  worker: Workflow,
  database: Database,
  "event-channel": GitBranch,
  "external-system": Hexagon,
  "identity-auth": ShieldCheck,
  "generic-component": Component,
  "cache-store": Archive,
  "object-store": HardDrive,
  endpoint: Route,
  entity: Boxes,
  "event-contract": GitBranch,
  "business-rule": Braces,
  "validation-rule": FileCheck,
  policy: Landmark,
}

const MODE_CONFIG: Array<{
  mode: ToolbarMode
  label: string
  icon: LucideIcon
}> = [
  { mode: "select", label: "Select / Move", icon: MousePointer2 },
  { mode: "semantic-node", label: "Add Semantic Node", icon: Component },
  { mode: "relationship", label: "Connect Relationship", icon: Link2 },
  { mode: "drilldown", label: "Drill-down Layer", icon: Layers },
  { mode: "metadata", label: "Inspect Metadata", icon: InspectionPanel },
  { mode: "annotate", label: "Annotate", icon: StickyNote },
]

const PREVIEW_FILL = NODE_COLORS[0].fill
const PREVIEW_STROKE = "rgba(255,255,255,0.3)"

function PreviewDiamond() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polygon points="50,0 100,50 50,100 0,50" fill={PREVIEW_FILL} stroke={PREVIEW_STROKE} strokeWidth="2" />
    </svg>
  )
}

function PreviewHexagon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polygon points="25,0 75,0 100,50 75,100 25,100 0,50" fill={PREVIEW_FILL} stroke={PREVIEW_STROKE} strokeWidth="2" />
    </svg>
  )
}

function PreviewCylinder() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect x="0" y="15" width="100" height="70" fill={PREVIEW_FILL} />
      <line x1="0" y1="15" x2="0" y2="85" stroke={PREVIEW_STROKE} strokeWidth="2" />
      <line x1="100" y1="15" x2="100" y2="85" stroke={PREVIEW_STROKE} strokeWidth="2" />
      <ellipse cx="50" cy="85" rx="50" ry="15" fill={PREVIEW_FILL} stroke={PREVIEW_STROKE} strokeWidth="2" />
      <ellipse cx="50" cy="15" rx="50" ry="15" fill={PREVIEW_FILL} stroke={PREVIEW_STROKE} strokeWidth="2" />
    </svg>
  )
}

function previewBorderRadius(shape: NodeShape): string {
  if (shape === "pill") return "9999px"
  if (shape === "circle") return "50%"
  return "12px"
}

function ShapePreview({ shape }: { shape: NodeShape }) {
  const { width, height } = SHAPE_DEFAULTS[shape]
  const isSvg = shape === "diamond" || shape === "hexagon" || shape === "cylinder"

  return (
    <div style={{ width, height, pointerEvents: "none" }}>
      {isSvg ? (
        <>
          {shape === "diamond" && <PreviewDiamond />}
          {shape === "hexagon" && <PreviewHexagon />}
          {shape === "cylinder" && <PreviewCylinder />}
        </>
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: PREVIEW_FILL,
            border: `1px solid ${PREVIEW_STROKE}`,
            borderRadius: previewBorderRadius(shape),
          }}
        />
      )}
    </div>
  )
}

interface DragState {
  shape: NodeShape
  x: number
  y: number
  data?: Partial<CanvasNodeData>
}

interface CanvasDragPayload {
  shape: NodeShape
  size: { width: number; height: number }
  data?: Partial<CanvasNodeData>
  idPrefix?: string
}

function ToolbarModeButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border p-0 transition-colors " +
        (active
          ? "border-accent-primary/45 bg-accent-primary/15 text-text-primary shadow-[0_0_18px_rgba(0,200,212,0.16)]"
          : "border-transparent text-text-muted hover:border-border-subtle hover:bg-bg-elevated hover:text-text-primary")
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="sr-only">{label}</span>
    </button>
  )
}

function RelationButton({
  type,
  active,
  onClick,
}: {
  type: EdgeRelationshipType
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={edgeRelationshipTypeLabel(type)}
      aria-pressed={active}
      className={
        "rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition-colors " +
        (active
          ? "border-accent-ai/50 bg-accent-ai/20 text-text-primary"
          : "border-border-default bg-bg-elevated text-accent-ai-text hover:border-accent-ai/45 hover:text-text-primary")
      }
    >
      {edgeRelationshipTypeLabel(type)}
    </button>
  )
}

export function ShapePanel({
  graphScopeKind,
  isStacked,
  selectedNode,
  selectedRelationshipType,
  onRelationshipTypeChange,
  onOpenDrilldownLayer,
}: {
  graphScopeKind: CanvasScopeKind
  isStacked: boolean
  selectedNode: CanvasNode | null
  selectedRelationshipType: EdgeRelationshipType
  onRelationshipTypeChange: (relationshipType: EdgeRelationshipType) => void
  onOpenDrilldownLayer: () => void
}) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const [mode, setMode] = useState<ToolbarMode>("semantic-node")
  const [showMoreNodes, setShowMoreNodes] = useState(false)
  const [showAdvancedRelations, setShowAdvancedRelations] = useState(false)

  function handleDragStart(event: React.DragEvent, payload: CanvasDragPayload) {
    const shape = payload.shape
    const serializedPayload = JSON.stringify(payload)
    event.dataTransfer.setData("application/arc-forge-shape", serializedPayload)
    event.dataTransfer.effectAllowed = "copy"

    const ghost = document.createElement("div")
    ghost.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;"
    document.body.appendChild(ghost)
    event.dataTransfer.setDragImage(ghost, 0, 0)
    setTimeout(() => document.body.removeChild(ghost), 0)

    setDrag({ shape, data: payload.data, x: event.clientX, y: event.clientY })
  }

  function handleDrag(event: React.DragEvent, shape: NodeShape, data?: Partial<CanvasNodeData>) {
    if (event.clientX === 0 && event.clientY === 0) return
    setDrag({ shape, data, x: event.clientX, y: event.clientY })
  }

  function handleDragEnd() {
    setDrag(null)
  }

  function renderSemanticTemplate(template: SemanticNodeTemplate, variant: "root" | "internal") {
    const Icon = SEMANTIC_TEMPLATE_ICONS[template.semanticType]
    const color = NODE_COLORS[template.colorIndex]
    const payload = {
      shape: template.shape,
      size: semanticTemplateSize(template),
      data: {
        ...template.data,
        color: color.fill,
        textColor: color.text,
        shape: template.shape,
        status: "draft",
        tags: [],
        sourceRefs: [],
        assumptions: [],
        decisionRefs: [],
        owner: null,
      },
      idPrefix: template.semanticType,
    } satisfies CanvasDragPayload

    return (
      <button
        key={`${variant}-${template.semanticType}`}
        draggable
        onDragStart={(e) => handleDragStart(e, payload)}
        onDrag={(e) => handleDrag(e, template.shape, payload.data)}
        onDragEnd={handleDragEnd}
        title={template.title}
        aria-label={`Add ${template.title}`}
        className={
          variant === "root"
            ? "flex h-8 w-8 cursor-grab items-center justify-center rounded-xl border border-accent-primary/20 bg-accent-primary/10 text-accent-primary transition-colors hover:border-accent-primary/50 hover:bg-accent-primary/15 hover:text-text-primary active:cursor-grabbing"
            : "flex h-8 w-8 cursor-grab items-center justify-center rounded-xl border border-accent-ai/25 bg-accent-ai/10 text-accent-ai-text transition-colors hover:border-accent-ai/60 hover:bg-accent-ai/15 hover:text-text-primary active:cursor-grabbing"
        }
      >
        <Icon className="h-4 w-4" />
      </button>
    )
  }

  const previewSize = drag ? SHAPE_DEFAULTS[drag.shape] : null
  const defaultTemplates = SEMANTIC_NODE_TEMPLATES.filter(
    (template) => template.group !== "advanced"
  )
  const advancedTemplates = SEMANTIC_NODE_TEMPLATES.filter(
    (template) => template.group === "advanced"
  )
  const serviceInternalTemplates =
    graphScopeKind !== "system-root" ? SERVICE_INTERNAL_NODE_TEMPLATES : []
  const panelPositionClass = isStacked
    ? "pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center"
    : "pointer-events-none absolute inset-x-0 bottom-4 flex justify-center"
  const shellClass = isStacked
    ? "pointer-events-auto flex max-w-full flex-col gap-1.5 overflow-hidden rounded-2xl border border-border-default bg-bg-surface/95 p-2 shadow-xl backdrop-blur-xl"
    : "pointer-events-auto flex max-w-[min(100%-2rem,48rem)] flex-col gap-1.5 overflow-hidden rounded-2xl border border-border-default bg-bg-surface/95 p-2 shadow-xl backdrop-blur-xl"

  return (
    <>
      {drag && previewSize && (
        <div
          style={{
            position: "fixed",
            left: drag.x - previewSize.width / 2,
            top: drag.y - previewSize.height / 2,
            opacity: 0.65,
            pointerEvents: "none",
            zIndex: 9999,
          }}
        >
          <ShapePreview shape={drag.shape} />
        </div>
      )}

      <div className={panelPositionClass} data-testid="shape-panel">
        <div className={shellClass}>
          <div className="flex max-w-full items-center justify-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {MODE_CONFIG.map((item) => (
              <ToolbarModeButton
                key={item.mode}
                icon={item.icon}
                label={item.label}
                active={mode === item.mode}
                onClick={() => setMode(item.mode)}
              />
            ))}
          </div>

          {mode === "semantic-node" ? (
            <div className="flex max-w-full items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="add-semantic-node-picker">
              {defaultTemplates.map((template) => renderSemanticTemplate(template, "root"))}
              <button
                type="button"
                onClick={() => setShowMoreNodes((current) => !current)}
                aria-expanded={showMoreNodes}
                className="flex h-8 items-center gap-1 rounded-xl border border-border-default bg-bg-elevated px-2 text-[11px] font-medium text-text-secondary transition-colors hover:border-accent-primary/40 hover:text-text-primary"
              >
                <MoreHorizontal className="h-4 w-4" />
                More
                <ChevronDown className={`h-3 w-3 transition-transform ${showMoreNodes ? "rotate-180" : ""}`} />
              </button>
              {showMoreNodes ? advancedTemplates.map((template) => renderSemanticTemplate(template, "root")) : null}
              {serviceInternalTemplates.length > 0 ? (
                <>
                  <div className="mx-1 h-5 w-px shrink-0 bg-border-default" />
                  {serviceInternalTemplates.map((template) => renderSemanticTemplate(template, "internal"))}
                </>
              ) : null}
            </div>
          ) : null}

          {mode === "relationship" ? (
            <div className="flex max-w-full items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="connect-relationship-picker">
              {QUICK_EDGE_RELATIONSHIP_TYPES.map((type) => (
                <RelationButton
                  key={type}
                  type={type}
                  active={selectedRelationshipType === type}
                  onClick={() => onRelationshipTypeChange(type)}
                />
              ))}
              <button
                type="button"
                onClick={() => setShowAdvancedRelations((current) => !current)}
                aria-expanded={showAdvancedRelations}
                className="flex h-8 items-center gap-1 rounded-xl border border-border-default bg-bg-elevated px-2 text-[11px] font-medium text-text-secondary transition-colors hover:border-accent-ai/45 hover:text-text-primary"
              >
                <MoreHorizontal className="h-4 w-4" />
                Advanced
                <ChevronDown className={`h-3 w-3 transition-transform ${showAdvancedRelations ? "rotate-180" : ""}`} />
              </button>
              {showAdvancedRelations
                ? ADVANCED_EDGE_RELATIONSHIP_TYPES.map((type) => (
                    <RelationButton
                      key={type}
                      type={type}
                      active={selectedRelationshipType === type}
                      onClick={() => onRelationshipTypeChange(type)}
                    />
                  ))
                : null}
            </div>
          ) : null}

          {mode === "drilldown" ? (
            <div className="flex items-center gap-2 rounded-xl border border-accent-primary/20 bg-accent-primary/10 px-2 py-1.5 text-xs text-text-secondary" data-testid="drill-down-layer-mode">
              <Layers className="h-4 w-4 text-accent-primary" />
              <span className="min-w-0 truncate">
                {selectedNode
                  ? selectedNode.data.subcanvasRef?.graphId
                    ? `Open ${selectedNode.data.label || selectedNode.id} layer`
                    : `Create layer for ${selectedNode.data.label || selectedNode.id}`
                  : "Select a node to create or open its child layer."}
              </span>
              <button
                type="button"
                onClick={onOpenDrilldownLayer}
                disabled={!selectedNode}
                className="ml-auto h-7 shrink-0 rounded-xl border border-accent-primary/35 bg-bg-surface px-2 text-[11px] font-medium text-text-primary transition-colors hover:border-accent-primary/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {selectedNode?.data.subcanvasRef?.graphId ? "Open" : "Create"}
              </button>
            </div>
          ) : null}

          {mode === "metadata" ? (
            <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-2 py-1.5 text-xs text-text-secondary" data-testid="inspect-metadata-mode">
              <InspectionPanel className="h-4 w-4 text-accent-primary" />
              <span className="truncate">
                {selectedNode
                  ? `Metadata drawer focused on ${selectedNode.data.label || selectedNode.id}.`
                  : "Select a node or edge to edit compact metadata."}
              </span>
            </div>
          ) : null}

          {mode === "annotate" ? (
            <div className="flex max-w-full items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="annotate-generic-picker">
              {NODE_SHAPES.map((shape) => {
                const Icon = SHAPE_ICONS[shape]
                const payload = { shape, size: SHAPE_DEFAULTS[shape] }
                return (
                  <button
                    key={shape}
                    draggable
                    onDragStart={(e) => handleDragStart(e, payload)}
                    onDrag={(e) => handleDrag(e, shape)}
                    onDragEnd={handleDragEnd}
                    title={shape}
                    aria-label={`Add generic ${shape}`}
                    className="flex h-8 w-8 cursor-grab items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary active:cursor-grabbing"
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
