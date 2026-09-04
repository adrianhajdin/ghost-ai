"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"

interface EntraSignInButtonProps {
  configured?: boolean
}

export function EntraSignInButton({ configured = true }: EntraSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleSignIn = () => {
    setIsLoading(true)
    const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl")
    const safeCallbackUrl =
      callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")
        ? callbackUrl
        : "/editor"

    void signIn("azure-ad", { callbackUrl: safeCallbackUrl })
  }

  return (
    <Button
      type="button"
      onClick={handleSignIn}
      disabled={isLoading || !configured}
      className="w-full gap-2 bg-accent-primary text-bg-base hover:bg-accent-primary/85"
    >
      {isLoading
        ? "Redirecting..."
        : configured
          ? "Continue with Microsoft Entra ID"
          : "Entra ID is not configured"}
    </Button>
  )
}
