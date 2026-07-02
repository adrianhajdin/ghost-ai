"use client"

import {
  FileJson,
  FileText,
  LayoutTemplate,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  Share2,
  Sparkles,
} from "lucide-react"
import { UserMenu } from "@/components/auth/user-menu"
import { Button } from "@/components/ui/button"
import type { SaveStatus } from "@/hooks/use-canvas-autosave"

interface EditorNavbarProps {
  isOpen: boolean
  onToggle: () => void
  projectName?: string
  isAiSidebarOpen?: boolean
  onToggleAiSidebar?: () => void
  onOpenShareDialog?: () => void
  onOpenTemplates?: () => void
  onOpenDesignIr?: () => void
  onOpenPromptPack?: () => void
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
  onOpenDesignIr,
  onOpenPromptPack,
  saveStatus,
  onSave,
}: EditorNavbarProps) {
  return (
    <header className="relative z-[60] flex h-12 shrink-0 items-center justify-between border-b border-border-default bg-bg-surface px-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
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

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {onToggleAiSidebar ? (
          <>
            {onSave ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-0 px-2 sm:gap-2 sm:px-3"
                onClick={onSave}
                disabled={saveStatus === "saving"}
                aria-label="Save canvas"
              >
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {saveStatus === "saving"
                    ? "Saving..."
                    : saveStatus === "saved"
                    ? "Saved"
                    : saveStatus === "error"
                    ? "Error"
                    : "Save"}
                </span>
              </Button>
            ) : null}
            {onOpenTemplates ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-0 px-2 sm:gap-2 sm:px-3"
                onClick={onOpenTemplates}
                aria-label="Templates"
              >
                <LayoutTemplate className="h-4 w-4" />
                <span className="hidden sm:inline">Templates</span>
              </Button>
            ) : null}
            {onOpenShareDialog ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-0 px-2 sm:gap-2 sm:px-3"
                onClick={onOpenShareDialog}
                aria-label="Share project"
              >
                <Share2 className="h-4 w-4" />
                <span className="hidden sm:inline">Share</span>
              </Button>
            ) : null}
            {onOpenDesignIr ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-0 px-2 sm:gap-2 sm:px-3"
                onClick={onOpenDesignIr}
                aria-label="Open Design IR"
              >
                <FileJson className="h-4 w-4" />
                <span className="hidden sm:inline">Design IR</span>
              </Button>
            ) : null}
            {onOpenPromptPack ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-0 px-2 sm:gap-2 sm:px-3"
                onClick={onOpenPromptPack}
                aria-label="Open Prompt Pack"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Prompt Pack</span>
              </Button>
            ) : null}
            <Button
              variant={isAiSidebarOpen ? "default" : "outline"}
              size="sm"
              className="gap-0 px-2 sm:gap-2 sm:px-3"
              onClick={onToggleAiSidebar}
              aria-label="Toggle AI workspace"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">AI</span>
            </Button>
          </>
        ) : null}

        <div className="hidden sm:block">
          <UserMenu />
        </div>
        <div className="sm:hidden">
          <UserMenu compact />
        </div>
      </div>
    </header>
  )
}
