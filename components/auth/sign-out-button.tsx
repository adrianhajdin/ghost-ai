"use client"

import { LogOut } from "lucide-react"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"

interface SignOutButtonProps {
  compact?: boolean
}

export function SignOutButton({ compact = false }: SignOutButtonProps) {
  return (
    <Button
      variant="ghost"
      size={compact ? "icon-sm" : "sm"}
      onClick={() => void signOut({ callbackUrl: "/sign-in" })}
      aria-label="Sign out"
      title="Sign out"
      className={compact ? "text-text-muted hover:bg-bg-subtle hover:text-text-primary" : "gap-2"}
    >
      <LogOut className="h-4 w-4" />
      {!compact ? "Sign out" : <span className="sr-only">Sign out</span>}
    </Button>
  )
}
