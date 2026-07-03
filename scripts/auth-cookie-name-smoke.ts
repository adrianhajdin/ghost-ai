import assert from "node:assert/strict"

import {
  DEFAULT_AUTH_SESSION_COOKIE_NAME,
  resolveAuthSessionCookieName,
} from "@/lib/auth/constants"

function assertDefault(input: string | undefined) {
  assert.equal(resolveAuthSessionCookieName(input), DEFAULT_AUTH_SESSION_COOKIE_NAME)
}

function assertCookieName(input: string | undefined, expected: string) {
  const resolved = resolveAuthSessionCookieName(input)

  assert.equal(resolved, expected)
  assert.notEqual(resolved, "")
}

function assertConfigError(input: string) {
  assert.throws(
    () => resolveAuthSessionCookieName(input),
    /Invalid AUTH_SESSION_COOKIE_NAME configuration/
  )
}

assertDefault(undefined)
assertDefault(null as unknown as string | undefined)
assertDefault("")
assertDefault("   ")
assertDefault("\t\n\r")

assertCookieName("arc_forge_session", "arc_forge_session")
assertCookieName(" arc_forge_session ", "arc_forge_session")
assertCookieName("arc_forge_session\r", "arc_forge_session")
assertCookieName("ion_arc_session", "ion_arc_session")
assertCookieName("ion-arc-session", "ion-arc-session")
assertCookieName("arcForgeSession", "arcForgeSession")

assertConfigError("bad name")
assertConfigError("bad=name")
assertConfigError("bad;name")
assertConfigError("bad,name")
assertConfigError("bad\nname")
assertConfigError("bad\rname")
assertConfigError("bad\tname")
assertConfigError('"badname"')

const defaultHeader = `${resolveAuthSessionCookieName(undefined)}=TOKEN; Path=/; HttpOnly; SameSite=lax`
assert(defaultHeader.startsWith("arc_forge_session="))
assert(!defaultHeader.startsWith("="))

for (const input of [
  undefined,
  "",
  "   ",
  "\t\n\r",
  "arc_forge_session",
  " arc_forge_session ",
  "arc_forge_session\r",
  "ion_arc_session",
  "ion-arc-session",
]) {
  assert.notEqual(resolveAuthSessionCookieName(input), "")
}

console.info("auth cookie name smoke passed")
