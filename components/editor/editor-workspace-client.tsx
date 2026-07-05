"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { EditorNavbar } from "@/components/editor/editor-navbar"
import type { SaveStatus } from "@/hooks/use-canvas-autosave"
import { ProjectDialogs } from "@/components/editor/project-dialogs"
import { ProjectShareDialog } from "@/components/editor/project-share-dialog"
import { StarterTemplatesModal } from "@/components/editor/starter-templates-modal"
import { DesignIrPanel } from "@/components/editor/design-ir-panel"
import { PromptPackPanel } from "@/components/editor/prompt-pack-panel"
import { ProjectSidebar } from "@/components/editor/project-sidebar"
import { AiSidebar } from "@/components/editor/ai-sidebar"
import { CanvasRoom } from "@/components/editor/canvas/canvas-room"
import { useProjectActions, type ProjectRow } from "@/hooks/use-project-actions"
import type { CanvasTemplate } from "@/components/editor/starter-templates"
import { InternalRealtimeProvider } from "@/hooks/use-realtime-room"
import { createRealtimeRoomId } from "@/lib/canvas/graph-ids"
import { cn } from "@/lib/utils"

interface EditorWorkspaceClientProps {
  currentProject: ProjectRow
  ownedProjects: ProjectRow[]
  sharedProjects: ProjectRow[]
  roomId: string
  graphId: string
}

export function EditorWorkspaceClient({
  currentProject,
  ownedProjects,
  sharedProjects,
  roomId,
  graphId,
}: EditorWorkspaceClientProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [designIrOpen, setDesignIrOpen] = useState(false)
  const [promptPackOpen, setPromptPackOpen] = useState(false)
  const [pendingTemplate, setPendingTemplate] = useState<CanvasTemplate | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [usesDesktopGutters, setUsesDesktopGutters] = useState(false)
  const saveFnRef = useRef<() => void>(() => {})
  const actions = useProjectActions()
  const realtimeRoomId = createRealtimeRoomId(currentProject.id, graphId)

  const handleSaveStatusChange = useCallback((status: SaveStatus) => setSaveStatus(status), [])
  const handleSaveReady = useCallback((fn: () => void) => { saveFnRef.current = fn }, [])

  useEffect(() => {
    let initializedAiSidebar = false

    function updateDesktopGutters() {
      const isDesktop = window.innerWidth >= 1024
      setUsesDesktopGutters(isDesktop)
      if (!initializedAiSidebar) {
        initializedAiSidebar = true
        setAiSidebarOpen(isDesktop)
      }
    }

    updateDesktopGutters()
    window.addEventListener("resize", updateDesktopGutters)

    return () => window.removeEventListener("resize", updateDesktopGutters)
  }, [])

  return (
    <InternalRealtimeProvider
      key={graphId}
      projectId={currentProject.id}
      roomId={realtimeRoomId}
      graphId={graphId}
    >
        <div className="flex h-screen w-full max-w-full flex-col overflow-hidden bg-bg-base">
          <EditorNavbar
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen((prev) => !prev)}
            projectName={currentProject.name}
            isAiSidebarOpen={aiSidebarOpen}
            onToggleAiSidebar={() => setAiSidebarOpen((prev) => !prev)}
            onOpenShareDialog={() => setShareDialogOpen(true)}
            onOpenTemplates={() => setTemplatesOpen(true)}
            onOpenDesignIr={() => setDesignIrOpen(true)}
            onOpenPromptPack={() => setPromptPackOpen(true)}
            saveStatus={saveStatus}
            onSave={() => saveFnRef.current()}
          />

          <main
            className={cn(
              "relative min-h-0 min-w-0 max-w-full flex-1 overflow-hidden",
              usesDesktopGutters ? "transition-[padding] duration-300 ease-out" : "transition-none",
              usesDesktopGutters && sidebarOpen && "pl-[19.75rem]",
              usesDesktopGutters && aiSidebarOpen && "pr-[22rem]"
            )}
          >
            <CanvasRoom
              projectId={currentProject.id}
              graphId={graphId}
              pendingTemplate={pendingTemplate}
              onTemplateImported={() => setPendingTemplate(null)}
              onSaveStatusChange={handleSaveStatusChange}
              onSaveReady={handleSaveReady}
              onSelectedNodeIdsChange={setSelectedNodeIds}
            />
          </main>

          <ProjectSidebar
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            ownedProjects={ownedProjects}
            sharedProjects={sharedProjects}
            onNewProject={actions.openCreate}
            onRename={actions.openRename}
            onDelete={actions.openDelete}
            activeProjectId={currentProject.id}
          />

          <AiSidebar
            isOpen={aiSidebarOpen}
            onClose={() => setAiSidebarOpen(false)}
            roomId={roomId}
            projectId={currentProject.id}
            graphId={graphId}
            selectedNodeIds={selectedNodeIds}
            onOpenPromptPack={() => setPromptPackOpen(true)}
          />

          <ProjectDialogs {...actions} />
          <ProjectShareDialog
            projectId={currentProject.id}
            open={shareDialogOpen}
            onOpenChange={setShareDialogOpen}
          />
          <StarterTemplatesModal
            open={templatesOpen}
            onOpenChange={setTemplatesOpen}
            onImport={(template) => setPendingTemplate(template)}
          />
          <DesignIrPanel
            projectId={currentProject.id}
            open={designIrOpen}
            onOpenChange={setDesignIrOpen}
          />
          <PromptPackPanel
            projectId={currentProject.id}
            graphId={graphId}
            selectedNodeIds={selectedNodeIds}
            open={promptPackOpen}
            onOpenChange={setPromptPackOpen}
          />
        </div>
    </InternalRealtimeProvider>
  )
}
