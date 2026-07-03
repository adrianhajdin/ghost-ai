import { cookies } from "next/headers"
import {
  AUTH_SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "@/lib/auth/constants"

function assertAuthSessionCookieName(name: string) {
  if (!name) {
    throw new Error("Invalid auth session cookie configuration: cookie name is empty.")
  }
}

function getCookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(expires ? { expires } : { maxAge: SESSION_TTL_SECONDS }),
  }
}

export async function setAuthSessionCookie(token: string, expiresAt: Date) {
  assertAuthSessionCookieName(AUTH_SESSION_COOKIE_NAME)

  const cookieStore = await cookies()

  cookieStore.set(
    AUTH_SESSION_COOKIE_NAME,
    token,
    getCookieOptions(expiresAt)
  )
}

export async function clearAuthSessionCookie() {
  assertAuthSessionCookieName(AUTH_SESSION_COOKIE_NAME)

  const cookieStore = await cookies()

  cookieStore.set(AUTH_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
}
