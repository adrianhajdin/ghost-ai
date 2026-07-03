export const DEFAULT_AUTH_SESSION_COOKIE_NAME = "arc_forge_session"

const SAFE_COOKIE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/

export function resolveAuthSessionCookieName(value: string | undefined): string {
  if (value == null) return DEFAULT_AUTH_SESSION_COOKIE_NAME

  const trimmedValue = value.trim()
  if (!trimmedValue) return DEFAULT_AUTH_SESSION_COOKIE_NAME

  if (!SAFE_COOKIE_NAME_PATTERN.test(trimmedValue)) {
    throw new Error(
      "Invalid AUTH_SESSION_COOKIE_NAME configuration: use only letters, numbers, underscores, and dashes."
    )
  }

  return trimmedValue
}

export const AUTH_SESSION_COOKIE_NAME = resolveAuthSessionCookieName(
  process.env.AUTH_SESSION_COOKIE_NAME
)

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
