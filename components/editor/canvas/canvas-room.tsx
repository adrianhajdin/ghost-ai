"use client"

import { ReactFlowProvider } from "@xyflow/react"
import { CanvasEditor } from "@/components/editor/canvas/canvas-editor"
import type { CanvasTemplate } from "@/components/editor/starter-templates"
import type { SaveStatus } from "@/hooks/use-canvas-autosave"

interface CanvasRoomProps {
  projectId: string
  graphId: string
  pendingTemplate?: CanvasTemplate | null
  onTemplateImported?: () => void
  onSaveStatusChange?: (status: SaveStatus) => void
  onSaveReady?: (saveFn: () => void) => void
  onSelectedNodeIdsChange?: (nodeIds: string[]) => void
}

export function CanvasRoom({ projectId, graphId, pendingTemplate, onTemplateImported, onSaveStatusChange, onSaveReady, onSelectedNodeIdsChange }: CanvasRoomProps) {
  return (
    <div className="h-full w-full">
      <ReactFlowProvider key={graphId}>
        <CanvasEditor
          projectId={projectId}
          graphId={graphId}
          pendingTemplate={pendingTemplate}
          onTemplateImported={onTemplateImported}
          onSaveStatusChange={onSaveStatusChange}
          onSaveReady={onSaveReady}
          onSelectedNodeIdsChange={onSelectedNodeIdsChange}
        />
      </ReactFlowProvider>
    </div>
  )
}
