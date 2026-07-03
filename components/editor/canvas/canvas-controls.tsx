"use client"

import { useState } from "react"
import { HelpCircle, Maximize, Minus, Plus, Redo2, Undo2, X } from "lucide-react"

interface CanvasControlsProps {
  onZoomOut: () => void
  onFitView: () => void
  onZoomIn: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  isStacked: boolean
}

export function CanvasControls({
  onZoomOut,
  onFitView,
  onZoomIn,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isStacked,
}: CanvasControlsProps) {
  const [isHelpOpen, setIsHelpOpen] = useState(false)

  return (
    <div
      className={
        isStacked
          ? "pointer-events-none absolute inset-x-4 bottom-20 z-10 flex justify-start"
          : "absolute bottom-4 left-4 z-10"
      }
      data-testid="canvas-controls"
    >
      {isHelpOpen ? (
        <CanvasHelp
          isStacked={isStacked}
          onClose={() => setIsHelpOpen(false)}
        />
      ) : null}
      <div className="pointer-events-auto flex max-w-[calc(100vw-1rem)] items-center gap-0.5 overflow-x-auto rounded-full border border-border-default bg-bg-surface/95 px-2 py-1.5 shadow-xl backdrop-blur-xl">
        <ControlButton onClick={onZoomOut} title="Zoom out">
          <Minus className="h-3.5 w-3.5" />
        </ControlButton>
        <ControlButton onClick={onFitView} title="Fit view">
          <Maximize className="h-3.5 w-3.5" />
        </ControlButton>
        <ControlButton onClick={onZoomIn} title="Zoom in">
          <Plus className="h-3.5 w-3.5" />
        </ControlButton>

        <div className="mx-1 h-4 w-px bg-border-default" />

        <ControlButton onClick={onUndo} title="Undo" disabled={!canUndo}>
          <Undo2 className="h-3.5 w-3.5" />
        </ControlButton>
        <ControlButton onClick={onRedo} title="Redo" disabled={!canRedo}>
          <Redo2 className="h-3.5 w-3.5" />
        </ControlButton>

        <div className="mx-1 h-4 w-px bg-border-default" />

        <ControlButton
          onClick={() => setIsHelpOpen((current) => !current)}
          title="Canvas controls"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </ControlButton>
      </div>
    </div>
  )
}

function CanvasHelp({
  isStacked,
  onClose,
}: {
  isStacked: boolean
  onClose: () => void
}) {
  return (
    <div
      className={
        isStacked
          ? "pointer-events-auto absolute bottom-12 left-0 max-h-[calc(100vh-9rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-border-default bg-bg-surface/95 p-3 text-xs text-text-secondary shadow-xl backdrop-blur-xl"
          : "absolute bottom-12 left-0 w-72 rounded-2xl border border-border-default bg-bg-surface/95 p-3 text-xs text-text-secondary shadow-xl backdrop-blur-xl"
      }
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-medium text-text-primary">Canvas controls</p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
          title="Close controls help"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="space-y-1.5">
        <li>Drag empty canvas: select multiple nodes.</li>
        <li>Click node or edge: select it.</li>
        <li>Drag a selected node: move the selected group.</li>
        <li>Delete or Backspace: delete selected items.</li>
        <li>Mouse wheel: zoom in or out.</li>
        <li>Middle or right drag empty canvas: pan.</li>
        <li>Double-click or Add label: edit labels.</li>
        <li>Drag an edge endpoint: reconnect the edge.</li>
        <li>Drag semantic templates to seed service, database, worker, or auth nodes.</li>
        <li>Select a node or edge: edit semantic metadata.</li>
        <li>Semantic warnings mark missing technical meaning.</li>
        <li>Subcanvas drill-down is prepared, not active yet.</li>
        <li>Use Save to persist the current canvas.</li>
      </ul>
    </div>
  )
}

interface ControlButtonProps {
  onClick: () => void
  title: string
  disabled?: boolean
  children: React.ReactNode
}

function ControlButton({ onClick, title, disabled, children }: ControlButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}
