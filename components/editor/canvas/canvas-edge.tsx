"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from "@xyflow/react"
import type { EdgeProps } from "@xyflow/react"
import { Plus, Trash2, X } from "lucide-react"
import type { CanvasEdge } from "@/types/canvas"
import { edgeRelationshipTypeLabel, normalizeEdgeRelationshipType } from "@/types/canvas"
import {
  createEdgeLabelItems,
  edgeLabelTexts,
  mirrorEdgeLabelData,
  normalizeEdgeLabelItems,
} from "@/lib/canvas/edge-labels"
import { useCanvasMutations } from "@/components/editor/canvas/canvas-mutation-context"

type EditingTarget = number | "new" | null

export function CanvasEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
  markerEnd,
}: EdgeProps<CanvasEdge>) {
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [draftLabel, setDraftLabel] = useState("")
  const draftLabelRef = useRef("")
  const hasCommittedEditRef = useRef(false)
  const labelEditorRef = useRef<HTMLDivElement>(null)
  const { deleteEdge, updateEdgeData } = useCanvasMutations()
  const labelItems = useMemo(() => normalizeEdgeLabelItems(data), [data])
  const labels = useMemo(() => edgeLabelTexts(data), [data])
  const relationshipType = normalizeEdgeRelationshipType(
    data?.relationshipType ?? data?.semanticType
  )

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  })

  const isEditing = editingTarget !== null
  const isActive = selected || isHovered || isEditing
  const showCompactAddButton = labels.length > 0 || !isActive
  const stroke = isActive ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)"

  const updateLabels = useCallback(
    (nextLabels: string[]) => {
      const cleanLabels = nextLabels
        .map((label) => label.trim())
        .filter(Boolean)
        .slice(0, 8)
      const cleanLabelItems = createEdgeLabelItems(cleanLabels, labelItems, `${id}-label`)

      updateEdgeData(id, {
        ...mirrorEdgeLabelData(cleanLabelItems),
      })
    },
    [id, labelItems, updateEdgeData]
  )

  const startEditing = useCallback(
    (target: EditingTarget) => (event: React.MouseEvent) => {
      event.stopPropagation()
      const nextDraft = typeof target === "number" ? labels[target] ?? "" : ""
      draftLabelRef.current = nextDraft
      hasCommittedEditRef.current = false
      setDraftLabel(nextDraft)
      setEditingTarget(target)
    },
    [labels]
  )

  const commitEdit = useCallback(
    (nextValue?: string) => {
      if (editingTarget === null) return
      if (hasCommittedEditRef.current) return
      hasCommittedEditRef.current = true

      const value = (nextValue ?? draftLabelRef.current).trim()
      if (editingTarget === "new") {
        if (value) updateLabels([...labels, value])
      } else {
        const nextLabels = [...labels]
        if (value) {
          nextLabels[editingTarget] = value
        } else {
          nextLabels.splice(editingTarget, 1)
        }
        updateLabels(nextLabels)
      }

      setEditingTarget(null)
      draftLabelRef.current = ""
      setDraftLabel("")
    },
    [editingTarget, labels, updateLabels]
  )

  const deleteLabel = useCallback(
    (index: number) => (event: React.MouseEvent) => {
      event.stopPropagation()
      const nextLabels = labels.filter((_, labelIndex) => labelIndex !== index)
      updateLabels(nextLabels)
    },
    [labels, updateLabels]
  )

  const handleDeleteEdge = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      deleteEdge(id)
    },
    [deleteEdge, id]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation()
      if (event.key === "Enter") {
        event.preventDefault()
        commitEdit(event.currentTarget.value)
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setEditingTarget(null)
        draftLabelRef.current = ""
        setDraftLabel("")
      }
    },
    [commitEdit]
  )

  useEffect(() => {
    if (editingTarget === null) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (labelEditorRef.current?.contains(target)) return

      commitEdit()
    }

    document.addEventListener("pointerdown", handlePointerDown, true)
    return () => document.removeEventListener("pointerdown", handlePointerDown, true)
  }, [commitEdit, editingTarget])

  return (
    <>
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onDoubleClick={labels.length > 0 ? startEditing(0) : startEditing("new")}
      />
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth: 1.5,
          strokeLinecap: "round",
          transition: "stroke 0.15s",
        }}
      />
      <EdgeLabelRenderer>
        <div
          ref={labelEditorRef}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan flex flex-col items-center gap-1"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {labels.map((label, index) => (
            <div
              key={`${id}-${index}-${label}`}
              className="flex items-center gap-1 rounded-full border border-border-subtle bg-bg-surface px-2.5 py-1 text-xs text-text-primary shadow-xl"
              onDoubleClick={startEditing(index)}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {editingTarget === index ? (
                <input
                  autoFocus
                  value={draftLabel}
                  onChange={(event) => {
                    draftLabelRef.current = event.target.value
                    setDraftLabel(event.target.value)
                  }}
                  onBlur={(event) => commitEdit(event.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={(event) => event.target.select()}
                  className="w-28 bg-transparent text-center text-xs text-text-primary outline-none"
                  aria-label="Edit edge label"
                />
              ) : (
                <>
                  <button
                    type="button"
                    className="cursor-text"
                    onClick={startEditing(index)}
                    title="Edit label"
                  >
                    {label}
                  </button>
                  {selected ? (
                    <button
                      type="button"
                      onClick={deleteLabel(index)}
                      className="flex h-4 w-4 items-center justify-center rounded-full text-text-faint transition-colors hover:bg-bg-subtle hover:text-text-primary"
                      title="Remove label"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ))}

          {isActive && relationshipType ? (
            <div className="rounded-full border border-accent-primary/25 bg-bg-surface/90 px-2 py-0.5 text-[10px] font-medium text-accent-primary shadow-xl">
              {edgeRelationshipTypeLabel(relationshipType)}
            </div>
          ) : null}

          <div className="flex items-center gap-1">
            {editingTarget === "new" ? (
              <input
                autoFocus
                value={draftLabel}
                onChange={(event) => {
                  draftLabelRef.current = event.target.value
                  setDraftLabel(event.target.value)
                }}
                onBlur={(event) => commitEdit(event.currentTarget.value)}
                onKeyDown={handleKeyDown}
                onFocus={(event) => event.target.select()}
                className="w-32 rounded-full border border-accent-ai/40 bg-bg-surface px-3 py-1 text-center text-xs text-text-primary shadow-xl outline-none"
                placeholder="Edge label"
                aria-label="New edge label"
              />
            ) : (
              <button
                type="button"
                onClick={startEditing("new")}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                className={
                  showCompactAddButton
                    ? "flex h-6 w-6 items-center justify-center rounded-full border border-accent-ai/40 bg-bg-surface/95 text-accent-ai-text shadow-xl transition-colors hover:border-accent-ai/70 hover:bg-accent-ai/15"
                    : "flex items-center gap-1 rounded-full border border-accent-ai/30 bg-accent-ai/10 px-2.5 py-1 text-[11px] font-medium text-accent-ai-text shadow-xl transition-colors hover:border-accent-ai/60 hover:bg-accent-ai/20"
                }
                title="Add edge label"
              >
                <Plus className="h-3 w-3" />
                {showCompactAddButton ? (
                  <span className="sr-only">Add label</span>
                ) : (
                  "Add label"
                )}
              </button>
            )}
            {selected ? (
              <button
                type="button"
                onClick={handleDeleteEdge}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-state-error/35 bg-bg-surface/95 text-state-error shadow-xl transition-colors hover:border-state-error/70 hover:bg-state-error/10"
                title="Delete edge"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
