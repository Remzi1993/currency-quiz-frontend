import { computed, readonly, ref, shallowRef } from 'vue'
import { ApiError } from '../api/client.ts'
import { getAdminApi, isBrowserSessionResponse, type AdminApi, type BrowserSessionResponse, type LoginRequest } from '../api/adminClient.ts'

export interface AdminSession {
  expiresAt: number
  accessExpiresAt: number
  absoluteExpiresAt: number
  username: string
  csrfToken: string
}

/** Used only to remove sessions saved by older frontend versions. */
export type AdminSessionStorage = Pick<Storage, 'removeItem'>
interface AdminSessionOptions {
  api?: Pick<AdminApi, 'getSession' | 'login' | 'logout' | 'refresh' | 'recordActivity'>
  storage?: AdminSessionStorage | null
  now?: () => number
  schedule?: (callback: () => void, milliseconds: number) => () => void
  withRefreshLock?: <T>(operation: () => Promise<T>) => Promise<T>
}

export const ADMIN_SESSION_STORAGE_KEY = 'currency-quiz.admin-session.v1'

function browserSessionStorage(): AdminSessionStorage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage ?? null } catch { return null }
}

function scheduleExpiry(callback: () => void, milliseconds: number): () => void {
  const timer = globalThis.setTimeout(callback, milliseconds)
  const hostTimer = timer as unknown as { unref?: () => void }
  hostTimer.unref?.()
  return () => globalThis.clearTimeout(timer)
}

async function browserRefreshLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && navigator.locks) {
    return navigator.locks.request('currency-quiz.admin-refresh', operation)
  }
  return operation()
}

/** Authentication stays in HttpOnly cookies. Only metadata and CSRF live in memory. */
export function createAdminSession(options: AdminSessionOptions = {}) {
  const storage = options.storage === undefined ? browserSessionStorage() : options.storage
  const now = options.now ?? Date.now
  const schedule = options.schedule ?? scheduleExpiry
  const state = shallowRef<AdminSession | null>(null)
  const restoreError = ref('')
  const isRestoring = ref(false)
  const isAuthenticated = computed(() => state.value !== null)
  let cancelExpiry: (() => void) | undefined
  let generation = 0
  let restored = false
  let restorePromise: Promise<AdminSession | null> | undefined
  let refreshPromise: Promise<string | null> | undefined
  let activityPromise: Promise<void> | undefined
  let lastReportedActivity = Number.NEGATIVE_INFINITY
  const api = () => options.api ?? getAdminApi()

  function removeLegacySession() {
    try { storage?.removeItem(ADMIN_SESSION_STORAGE_KEY) } catch { /* Cookie authentication does not depend on browser storage. */ }
  }

  function clearState() {
    cancelExpiry?.()
    cancelExpiry = undefined
    state.value = null
    removeLegacySession()
  }

  function invalidate() {
    generation++
    restorePromise = undefined
    refreshPromise = undefined
    activityPromise = undefined
    lastReportedActivity = Number.NEGATIVE_INFINITY
    isRestoring.value = false
    restored = true
    restoreError.value = ''
    clearState()
  }

  function getCsrfToken(): string | null {
    const session = state.value
    if (session === null) return null
    if (session.expiresAt <= now()) {
      invalidate()
      return null
    }
    return session.csrfToken
  }

  function armExpiry(session: AdminSession) {
    cancelExpiry?.()
    cancelExpiry = schedule(() => {
      if (state.value !== session) return
      if (getCsrfToken() !== null) armExpiry(session)
    }, Math.max(0, session.expiresAt - now()))
  }

  function accept(response: BrowserSessionResponse) {
    const timestamp = now()
    if (!isBrowserSessionResponse(response) || !Number.isSafeInteger(timestamp + response.absoluteExpiresIn * 1000)) {
      throw new TypeError('The quiz service returned an invalid admin session. Please sign in again.')
    }
    const session: AdminSession = {
      username: response.username,
      csrfToken: response.csrfToken,
      expiresAt: timestamp + response.expiresIn * 1000,
      accessExpiresAt: timestamp + response.accessExpiresIn * 1000,
      absoluteExpiresAt: timestamp + response.absoluteExpiresIn * 1000,
    }
    state.value = session
    restoreError.value = ''
    armExpiry(session)
  }

  /** Called before a user-requested operation; no background timer refreshes credentials. */
  function ensureAccess(signal?: AbortSignal): Promise<string | null> {
    if (refreshPromise) return refreshPromise
    if (!getCsrfToken()) return Promise.resolve(null)
    if (state.value!.accessExpiresAt > now() + 30_000) return Promise.resolve(state.value!.csrfToken)
    const current = generation
    const active = (options.withRefreshLock ?? browserRefreshLock)(async () => {
      try {
        const checked = await api().getSession(signal)
        if (current !== generation || signal?.aborted) return null
        accept(checked)
        // Another tab may already have rotated while this tab waited for the origin-wide lock.
        if (checked.accessExpiresIn <= 30) {
          const renewed = await api().refresh(checked.csrfToken, signal)
          if (current !== generation || signal?.aborted) return null
          accept(renewed)
        }
        return getCsrfToken()
      } catch (cause) {
        if (current === generation && !signal?.aborted && cause instanceof ApiError && cause.status === 401) invalidate()
        throw cause
      }
    })
    refreshPromise = active
    const finish = () => { if (refreshPromise === active) refreshPromise = undefined }
    void active.then(finish, finish)
    return active
  }

  /** Called from trusted user input, never by polling or visibility/focus timers. */
  function recordActivity(signal?: AbortSignal): Promise<void> {
    if (activityPromise) return activityPromise
    if (!getCsrfToken() || now() - lastReportedActivity < 30_000) return Promise.resolve()
    const current = generation
    const active = (async () => {
      const csrf = await ensureAccess(signal)
      if (!csrf || current !== generation || signal?.aborted) return
      try {
        const response = await api().recordActivity(csrf, signal)
        if (current === generation && !signal?.aborted) {
          accept(response)
          lastReportedActivity = now()
        }
      } catch (cause) {
        if (current === generation && !signal?.aborted) {
          if (cause instanceof ApiError && cause.status === 401) invalidate()
          else restoreError.value = cause instanceof Error ? cause.message : 'Your session activity could not be saved. Please try again.'
        }
        throw cause
      }
    })()
    activityPromise = active
    const finish = () => { if (activityPromise === active) activityPromise = undefined }
    void active.then(finish, finish)
    return active
  }

  function restore(force = false, signal?: AbortSignal): Promise<AdminSession | null> {
    if (restorePromise) return restorePromise
    if (!force && restored) {
      getCsrfToken()
      return Promise.resolve(state.value)
    }
    const current = generation
    isRestoring.value = true
    restoreError.value = ''
    restored = true
    const active = Promise.resolve().then(async () => {
      try {
        const response = await api().getSession(signal)
        if (current === generation && !signal?.aborted) accept(response)
      } catch (cause) {
        if (current !== generation || signal?.aborted) return state.value
        clearState()
        if (!(cause instanceof ApiError && cause.status === 401)) {
          restoreError.value = cause instanceof Error ? cause.message : 'Your admin session could not be checked. Please try again.'
          throw cause
        }
      } finally {
        if (current === generation) isRestoring.value = false
      }
      return state.value
    })
    restorePromise = active
    const finish = () => { if (restorePromise === active) restorePromise = undefined }
    void active.then(finish, finish)
    return active
  }

  async function signIn(credentials: LoginRequest, signal?: AbortSignal) {
    const current = ++generation
    restorePromise = undefined
    lastReportedActivity = Number.NEGATIVE_INFINITY
    isRestoring.value = false
    restored = true
    restoreError.value = ''
    const confirmed = await (options.withRefreshLock ?? browserRefreshLock)(async () => {
      if (current !== generation || signal?.aborted) return
      const response = await api().login(credentials, signal)
      if (current !== generation || signal?.aborted) return
      if (!isBrowserSessionResponse(response)) throw new TypeError('The quiz service returned an invalid admin session. Please sign in again.')
      try { return await api().getSession(signal) } catch (cause) {
        if (current !== generation || signal?.aborted) return
        if (cause instanceof ApiError && cause.status === 401) {
          throw new ApiError('The browser could not keep your admin session. Allow cookies for this website, or use the same-origin API address.', { status: 401, cause })
        }
        throw cause
      }
    })
    if (confirmed && current === generation && !signal?.aborted) accept(confirmed)
  }

  async function signOut(signal?: AbortSignal) {
    if (!state.value) return
    const current = ++generation
    restorePromise = undefined
    isRestoring.value = false
    try {
      await (options.withRefreshLock ?? browserRefreshLock)(async () => {
        if (current !== generation || signal?.aborted) return
        const checked = await api().getSession(signal)
        if (current !== generation || signal?.aborted) return
        await api().logout(checked.csrfToken, signal)
      })
    } catch (cause) {
      if (current !== generation || signal?.aborted) return
      if (!(cause instanceof ApiError && cause.status === 401)) throw cause
    }
    if (current === generation && !signal?.aborted) invalidate()
  }

  function dispose() {
    generation++
    restorePromise = undefined
    cancelExpiry?.()
    cancelExpiry = undefined
  }

  removeLegacySession()
  return {
    state: readonly(state), restoreError: readonly(restoreError), isRestoring: readonly(isRestoring),
    isAuthenticated, getCsrfToken, ensureAccess, recordActivity, restore, signIn, signOut, invalidate, dispose,
  }
}

export const adminSession = createAdminSession()
