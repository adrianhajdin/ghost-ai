"use client"

import { LayoutTemplate, PanelLeftClose, PanelLeftOpen, Save, Share2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SignOutButton } from "@/components/auth/sign-out-button"
import type { SaveStatus } from "@/hooks/use-canvas-autosave"

interface EditorNavbarProps {
  isOpen: boolean
  onToggle: () => void
  projectName?: string
  isAiSidebarOpen?: boolean
  onToggleAiSidebar?: () => void
  onOpenShareDialog?: () => void
  onOpenTemplates?: () => void
  saveStatus?: SaveStatus
  onSave?: () => void
}

export function EditorNavbar({
  isOpen,
  onToggle,
  projectName,
  isAiSidebarOpen = false,
  onToggleAiSidebar,
  onOpenShareDialog,
  onOpenTemplates,
  saveStatus,
  onSave,
}: EditorNavbarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-default bg-bg-surface px-3">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onToggle}>
          {isOpen ? (
            <PanelLeftClose className="h-5 w-5" />
          ) : (
            <PanelLeftOpen className="h-5 w-5" />
          )}
          <span className="sr-only">Toggle sidebar</span>
        </Button>

        {projectName ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">{projectName}</p>
            <p className="text-xs text-text-faint">Workspace</p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {onToggleAiSidebar ? (
          <>
            {onSave ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onSave}
                disabled={saveStatus === "saving"}
              >
                <Save className="h-4 w-4" />
                {saveStatus === "saving"
                  ? "Saving..."
                  : saveStatus === "saved"
                  ? "Saved"
                  : saveStatus === "error"
                  ? "Error"
                  : "Save"}
              </Button>
            ) : null}
            {onOpenTemplates ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onOpenTemplates}
              >
                <LayoutTemplate className="h-4 w-4" />
                Templates
              </Button>
            ) : null}
            {onOpenShareDialog ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onOpenShareDialog}
              >
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            ) : null}
            <Button
              variant={isAiSidebarOpen ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={onToggleAiSidebar}
            >
              <Sparkles className="h-4 w-4" />
              AI
            </Button>
          </>
        ) : null}

        {!onToggleAiSidebar ? <SignOutButton compact /> : null}
      </div>
    </header>
  )
}
