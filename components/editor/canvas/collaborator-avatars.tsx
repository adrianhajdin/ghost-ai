"use client"

import Image from "next/image"
import { useOthers } from "@liveblocks/react"
import { SignOutButton } from "@/components/auth/sign-out-button"

const MAX_VISIBLE = 5

export function CollaboratorAvatars() {
  const others = useOthers()

  const collaborators = others
  const visible = collaborators.slice(0, MAX_VISIBLE)
  const overflow = collaborators.length - MAX_VISIBLE

  return (
    <div className="absolute right-3 top-3 z-40 flex items-center gap-2">
      {visible.length > 0 && (
        <>
          <div className="flex items-center -space-x-2">
            {visible.map((other) => (
              <AvatarChip
                key={other.connectionId}
                name={other.info?.name ?? "Anonymous"}
                avatar={other.info?.avatar}
                color={other.info?.color ?? "#888888"}
              />
            ))}
            {overflow > 0 && (
              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-bg-base bg-bg-elevated text-xs font-medium text-text-primary ring-1 ring-white/20">
                +{overflow}
              </div>
            )}
          </div>
          <div className="h-5 w-px bg-border-subtle" />
        </>
      )}
      <SignOutButton compact />
    </div>
  )
}

function AvatarChip({
  name,
  avatar,
  color,
}: {
  name: string
  avatar?: string
  color: string
}) {
  const initials = name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <div
      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-bg-base text-xs font-semibold text-white ring-1 ring-white/20"
      style={{ background: avatar ? undefined : color }}
      title={name}
    >
      {avatar ? (
        <Image
          src={avatar}
          alt={name}
          fill
          className="rounded-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  )
}
