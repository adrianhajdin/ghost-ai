"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Handle, Position, NodeResizer, NodeToolbar } from "@xyflow/react"
import type { NodeProps } from "@xyflow/react"
import { PencilLine, Plus, Trash2 } from "lucide-react"
import type { CanvasNode, NodeShape } from "@/types/canvas"
import { NODE_COLORS, semanticNodeTypeLabel } from "@/types/canvas"
import { useCanvasMutations } from "@/components/editor/canvas/canvas-mutation-context"

const DEFAULT_FILL = NODE_COLORS[0].fill
const DEFAULT_TEXT = NODE_COLORS[0].text
const BORDER_REST = "rgba(255,255,255,0.1)"
const BORDER_SELECTED = "rgba(255,255,255,0.35)"
const RESIZER_COLOR = "rgba(255,255,255,0.3)"

const MIN_WIDTH = 60
const MIN_HEIGHT = 40

const HANDLE_CLS =
  "!h-2.5 !w-2.5 !rounded-full !border-2 !border-bg-base !bg-white opacity-0 transition-opacity group-hover/node:opacity-100"

const RESIZER_HANDLE_STYLE: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(255,255,255,0.2)",
}

const RESIZER_LINE_STYLE: React.CSSProperties = {
  borderColor: RESIZER_COLOR,
  borderWidth: 1,
}

function DiamondShape({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polygon points="50,0 100,50 50,100 0,50" fill={fill} stroke={stroke} strokeWidth="1.5" />
    </svg>
  )
}

function HexagonShape({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polygon points="25,0 75,0 100,50 75,100 25,100 0,50" fill={fill} stroke={stroke} strokeWidth="1.5" />
    </svg>
  )
}

function CylinderShape({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect x="0" y="15" width="100" height="70" fill={fill} />
      <line x1="0" y1="15" x2="0" y2="85" stroke={stroke} strokeWidth="1.5" />
      <line x1="100" y1="15" x2="100" y2="85" stroke={stroke} strokeWidth="1.5" />
      <ellipse cx="50" cy="85" rx="50" ry="15" fill={fill} stroke={stroke} strokeWidth="1.5" />
      <ellipse cx="50" cy="15" rx="50" ry="15" fill={fill} stroke={stroke} strokeWidth="1.5" />
    </svg>
  )
}

function cssBorderRadius(shape: NodeShape): string {
  if (shape === "pill") return "9999px"
  if (shape === "circle") return "50%"
  return "12px"
}

function metadataAccent(data: CanvasNode["data"]) {
  const exposure = String(data.exposure ?? "").trim().toLowerCase()
  const boundary = String(data.boundary ?? "").trim().toLowerCase()
  const value = exposure || boundary

  if (value === "public") return "rgba(247,95,143,0.55)"
  if (value === "external" || value === "partner") return "rgba(255,153,10,0.55)"
  if (value === "regulated" || value === "restricted") return "rgba(255,97,102,0.6)"
  if (value === "tenant" || value === "shared") return "rgba(191,122,240,0.55)"
  if (value === "internal") return "rgba(10,199,180,0.5)"
  if (data.semanticType === "reference-proxy") return "rgba(255,255,255,0.45)"
  return null
}

function trustBadgeText(data: CanvasNode["data"]) {
  const exposure = String(data.exposure ?? "").trim()
  const boundary = String(data.boundary ?? "").trim()
  const trustZone = String(data.trustZone ?? "").trim()
  const value = exposure && exposure !== "unknown" ? exposure : boundary || trustZone
  return value || null
}

interface ColorSwatchProps {
  pair: (typeof NODE_COLORS)[number]
  isActive: boolean
  onSelect: (fill: string, text: string) => void
}

interface LabelControlProps {
  hasLabel: boolean
  onClick: (event: React.MouseEvent<HTMLElement>) => void
}

function LabelControl({ hasLabel, onClick }: LabelControlProps) {
  const Icon = hasLabel ? PencilLine : Plus

  return (
    <button
      type="button"
      className="nodrag nopan flex h-7 items-center gap-1 rounded-full border border-border-subtle bg-bg-elevated px-2 text-[11px] font-medium text-text-secondary transition-colors hover:border-accent-primary/40 hover:text-text-primary"
      title={hasLabel ? "Edit node label" : "Add node label"}
      onClick={onClick}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Icon className="h-3 w-3" />
      {hasLabel ? "Edit label" : "Add label"}
    </button>
  )
}

function ColorSwatch({ pair, isActive, onSelect }: ColorSwatchProps) {
  return (
    <button
      className="nodrag nopan"
      style={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: pair.fill,
        border: isActive ? `2px solid ${pair.text}` : "2px solid rgba(255,255,255,0.12)",
        cursor: "pointer",
        flexShrink: 0,
        outline: "none",
        transition: "box-shadow 0.12s",
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 5px 2px ${pair.text}55`
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.boxShadow = "none"
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(pair.fill, pair.text)
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    />
  )
}

export function CanvasNodeComponent({ id, data, selected }: NodeProps<CanvasNode>) {
  const fill = data.color ?? DEFAULT_FILL
  const textColor = data.textColor ?? DEFAULT_TEXT
  const shape = data.shape ?? "rectangle"
  const semanticType = data.semanticType ?? "unclassified"
  const stroke = selected ? BORDER_SELECTED : BORDER_REST
  const accent = metadataAccent(data)
  const isReferenceProxy = semanticType === "reference-proxy"
  const boundaryBadge = trustBadgeText(data)
  const isSvg = shape === "diamond" || shape === "hexagon" || shape === "cylinder"
  const hasLabel = Boolean(data.label?.trim())

  const [isEditing, setIsEditing] = useState(false)
  const nodeRef = useRef<HTMLDivElement>(null)
  const editRef = useRef<HTMLDivElement>(null)
  const { deleteNode, updateNodeData } = useCanvasMutations()

  const updateNodeLabel = useCallback((newLabel: string) => {
    updateNodeData(id, { label: newLabel, name: newLabel })
  }, [id, updateNodeData])

  const updateNodeColor = useCallback((colorFill: string, colorText: string) => {
    updateNodeData(id, { color: colorFill, textColor: colorText })
  }, [id, updateNodeData])

  const handleDeleteNode = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    deleteNode(id)
  }, [deleteNode, id])

  const startEditing = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    setIsEditing(true)
  }, [])

  const commitEdit = useCallback(() => {
    const value = editRef.current?.textContent?.trim() ?? ""
    setIsEditing(false)
    updateNodeLabel(value)
  }, [updateNodeLabel])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      e.stopPropagation()
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault()
        commitEdit()
      }
    },
    [commitEdit]
  )

  useEffect(() => {
    if (!isEditing || !editRef.current) return
    const el = editRef.current
    el.textContent = data.label ?? ""
    el.focus()
    const sel = window.getSelection()
    if (sel) {
      const range = document.createRange()
      range.selectNodeContents(el)
      sel.removeAllRanges()
      sel.addRange(range)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing])

  useEffect(() => {
    if (!isEditing) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (nodeRef.current?.contains(target)) return

      commitEdit()
    }

    document.addEventListener("pointerdown", handlePointerDown, true)
    return () => document.removeEventListener("pointerdown", handlePointerDown, true)
  }, [commitEdit, isEditing])

  const labelClassName =
    "relative z-10 block min-w-0 max-w-full overflow-hidden truncate px-3 text-center leading-tight"
  const labelContent = hasLabel ? (
    <span
      className={labelClassName}
      style={{ color: textColor, visibility: isEditing ? "hidden" : "visible" }}
    >
      {data.label}
    </span>
  ) : (
    <button
      type="button"
      className={`${labelClassName} nodrag nopan flex items-center justify-center gap-1 text-xs font-medium opacity-60 transition-opacity hover:opacity-100`}
      style={{ color: textColor, visibility: isEditing ? "hidden" : "visible" }}
      title="Add node label"
      onClick={startEditing}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Plus className="h-3 w-3" />
      Add label
    </button>
  )

  return (
    <div
      ref={nodeRef}
      style={{ width: "100%", height: "100%" }}
      className="group/node relative flex items-center justify-center text-sm font-medium"
      onDoubleClick={startEditing}
    >
      <NodeResizer
        isVisible={selected ?? false}
        color={RESIZER_COLOR}
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        handleStyle={RESIZER_HANDLE_STYLE}
        lineStyle={RESIZER_LINE_STYLE}
      />

      <NodeToolbar isVisible={selected ?? false} position={Position.Top}>
        <div className="nodrag nopan relative z-50 flex items-center gap-1.5 rounded-full border border-border-default bg-bg-surface/95 px-2.5 py-1.5 shadow-xl backdrop-blur-xl">
          <LabelControl hasLabel={hasLabel} onClick={startEditing} />
          <div className="mx-0.5 h-5 w-px bg-border-default" />
          {NODE_COLORS.map((pair) => (
            <ColorSwatch
              key={pair.fill}
              pair={pair}
              isActive={pair.fill === fill}
              onSelect={updateNodeColor}
            />
          ))}
          <div className="mx-0.5 h-5 w-px bg-border-default" />
          <button
            type="button"
            className="nodrag nopan flex h-7 w-7 items-center justify-center rounded-full border border-state-error/35 bg-bg-surface text-state-error transition-colors hover:bg-state-error/10"
            title="Delete selected node"
            onClick={handleDeleteNode}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </NodeToolbar>

      <div
        className={
          "pointer-events-none absolute left-1.5 top-1.5 z-20 max-w-[calc(100%-12px)] truncate rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase leading-none tracking-normal " +
          (semanticType === "unclassified"
            ? "border-state-warning/40 bg-bg-surface/85 text-state-warning"
            : "border-accent-primary/35 bg-bg-surface/85 text-accent-primary")
        }
        title={semanticNodeTypeLabel(semanticType)}
      >
        {semanticNodeTypeLabel(semanticType)}
      </div>

      {isReferenceProxy ? (
        <div className="pointer-events-none absolute right-1.5 top-1.5 z-20 rounded-full border border-white/25 bg-bg-surface/85 px-1.5 py-0.5 text-[9px] font-medium uppercase leading-none text-text-muted">
          Ref
        </div>
      ) : null}

      {boundaryBadge ? (
        <div
          className="pointer-events-none absolute bottom-1.5 right-1.5 z-20 max-w-[calc(100%-12px)] truncate rounded-full border bg-bg-surface/85 px-1.5 py-0.5 text-[9px] font-medium uppercase leading-none text-text-muted"
          style={{ borderColor: accent ?? "rgba(255,255,255,0.18)" }}
          title={`Boundary / exposure: ${boundaryBadge}`}
        >
          {boundaryBadge}
        </div>
      ) : null}

      {isSvg ? (
        <>
          <div className="absolute inset-0 overflow-hidden">
            {shape === "diamond" && <DiamondShape fill={fill} stroke={accent ?? stroke} />}
            {shape === "hexagon" && <HexagonShape fill={fill} stroke={accent ?? stroke} />}
            {shape === "cylinder" && <CylinderShape fill={fill} stroke={accent ?? stroke} />}
          </div>
          {labelContent}
        </>
      ) : (
        <div
          style={{
            background: fill,
            borderRadius: cssBorderRadius(shape),
            border: `1px ${isReferenceProxy ? "dashed" : "solid"} ${accent ?? stroke}`,
            boxShadow: accent ? `0 0 0 1px ${accent}22, inset 0 0 18px ${accent}18` : undefined,
            width: "100%",
            height: "100%",
          }}
          className="flex items-center justify-center overflow-hidden"
        >
          {labelContent}
        </div>
      )}

      {isEditing && (
        <div
          ref={editRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          className="nodrag nopan absolute inset-0 z-20 flex items-center justify-center text-center text-sm font-medium outline-none cursor-text"
          style={{ color: textColor, wordBreak: "break-word", padding: "0 12px" }}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      )}

      <Handle id="top" type="source" position={Position.Top} className={HANDLE_CLS} />
      <Handle id="bottom" type="source" position={Position.Bottom} className={HANDLE_CLS} />
      <Handle id="left" type="source" position={Position.Left} className={HANDLE_CLS} />
      <Handle id="right" type="source" position={Position.Right} className={HANDLE_CLS} />
    </div>
  )
}
