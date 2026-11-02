import { computed, readonly, shallowRef } from 'vue'
import type { TokenResponse } from '../../shared/generated/typescript/schema'

export interface AdminSession {
  accessToken: string
  expiresAt: number
  username: string
}

export type AdminSessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

interface AdminSessionOptions {
  storage?: AdminSessionStorage | null
  now?: () => number
  schedule?: (callback: () => void, milliseconds: number) => () => void
}

export const ADMIN_SESSION_STORAGE_KEY = 'currency-quiz.admin-session.v1'
const MAX_SESSION_SECONDS = 86_400
const MAX_TOKEN_LENGTH = 16_384

function browserSessionStorage(): AdminSessionStorage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage ?? null } catch { return null }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUsername(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 100 && value === value.trim()
}

function isAccessToken(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= MAX_TOKEN_LENGTH
    && /^[A-Za-z0-9._~+/-]+={0,2}$/.test(value)
}

function scheduleExpiry(callback: () => void, milliseconds: number): () => void {
  const timer = globalThis.setTimeout(callback, milliseconds)
  // Native Node tests must not stay alive solely for a browser-session timer.
  const hostTimer = timer as unknown as { unref?: () => void }
  hostTimer.unref?.()
  return () => globalThis.clearTimeout(timer)
}

/** A tab-scoped bearer session. Passwords are never accepted or stored here. */
export function createAdminSession(options: AdminSessionOptions = {}) {
  const storage = options.storage === undefined ? browserSessionStorage() : options.storage
  const now = options.now ?? Date.now
  const schedule = options.schedule ?? scheduleExpiry
  const state = shallowRef<AdminSession | null>(null)
  const isAuthenticated = computed(() => state.value !== null)
  let cancelExpiry: (() => void) | undefined

  function removeStoredSession() {
    try { storage?.removeItem(ADMIN_SESSION_STORAGE_KEY) } catch { /* Storage can be blocked by browser policy. */ }
  }

  function readStoredSession(): AdminSession | null {
    let encoded: string | null
    try { encoded = storage?.getItem(ADMIN_SESSION_STORAGE_KEY) ?? null } catch { return null }
    if (encoded === null) return null
    try {
      const value: unknown = JSON.parse(encoded)
      const timestamp = now()
      if (isRecord(value) && Object.keys(value).length === 4 && value.version === 1
        && isAccessToken(value.accessToken) && isUsername(value.username)
        && typeof value.expiresAt === 'number' && Number.isSafeInteger(value.expiresAt)
        && value.expiresAt > timestamp && value.expiresAt <= timestamp + MAX_SESSION_SECONDS * 1000) {
        return { accessToken: value.accessToken, expiresAt: value.expiresAt, username: value.username }
      }
    } catch { /* Invalid or outdated sessions are discarded. */ }
    removeStoredSession()
    return null
  }

  function signOut() {
    cancelExpiry?.()
    cancelExpiry = undefined
    state.value = null
    removeStoredSession()
  }

  function getToken(): string | null {
    const session = state.value
    if (session === null) return null
    if (session.expiresAt <= now()) {
      signOut()
      return null
    }
    return session.accessToken
  }

  function armExpiry(session: AdminSession) {
    cancelExpiry?.()
    cancelExpiry = schedule(() => {
      // A queued callback from an older login must not clear its replacement.
      if (state.value !== session) return
      if (getToken() !== null) armExpiry(session)
    }, Math.max(0, session.expiresAt - now()))
  }

  function signIn(username: string, response: TokenResponse) {
    const normalizedUsername = typeof username === 'string' ? username.trim() : ''
    const timestamp = now()
    if (!isUsername(normalizedUsername) || !isRecord(response) || !isAccessToken(response.accessToken)
      || response.tokenType !== 'Bearer' || typeof response.expiresIn !== 'number'
      || !Number.isInteger(response.expiresIn) || response.expiresIn < 1 || response.expiresIn > MAX_SESSION_SECONDS
      || !Number.isSafeInteger(timestamp + response.expiresIn * 1000)) {
      throw new TypeError('The quiz service returned an invalid admin session. Please sign in again.')
    }
    const session: AdminSession = {
      accessToken: response.accessToken,
      expiresAt: timestamp + response.expiresIn * 1000,
      username: normalizedUsername,
    }
    state.value = session
    try {
      storage?.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify({ version: 1, ...session }))
    } catch { /* An in-memory session remains usable when storage is unavailable. */ }
    armExpiry(session)
  }

  function dispose() {
    cancelExpiry?.()
    cancelExpiry = undefined
  }

  state.value = readStoredSession()
  if (state.value !== null) armExpiry(state.value)

  return { state: readonly(state), isAuthenticated, getToken, signIn, signOut, dispose }
}

export const adminSession = createAdminSession()
