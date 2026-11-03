import assert from 'node:assert/strict'
import { test, afterEach, vi, onTestFinished } from 'vitest'
import { isReadonly } from 'vue'
import { ApiError } from '../api/client.ts'
import type { AdminApi, BrowserSessionResponse } from '../api/adminClient.ts'
import { ADMIN_SESSION_STORAGE_KEY, createAdminSession } from './adminSession.ts'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const credentials = { username: 'school-admin', password: 'example-only-password' }
const noTimer = () => () => {}
const metadata = (overrides: Partial<BrowserSessionResponse> = {}): BrowserSessionResponse => ({
  username: 'school-admin', csrfToken: 'a'.repeat(43), expiresIn: 900,
  accessExpiresIn: Math.min(300, overrides.expiresIn ?? 900), absoluteExpiresIn: 1800, ...overrides,
})
type SessionApi = Pick<AdminApi, 'getSession' | 'login' | 'logout' | 'refresh' | 'recordActivity'>
function fakeApi(overrides: Partial<SessionApi> = {}): SessionApi {
  return { login: async () => metadata(), getSession: async () => metadata(), logout: async () => {}, refresh: async () => metadata(), recordActivity: async () => metadata(), ...overrides }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
function originLock() {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const next = tail.then(operation)
    tail = next.catch(() => {})
    return next
  }
}

test('keeps only readonly metadata and CSRF in memory and removes legacy credentials without reading them', async () => {
  const values = new Map([[ADMIN_SESSION_STORAGE_KEY, 'old bearer token'], ['unrelated-preference', 'keep']])
  const storage = { getItem() { return assert.fail('Do not restore legacy tokens') }, setItem() { assert.fail('Do not persist authentication') }, removeItem(key: string) { values.delete(key) } }
  const session = createAdminSession({ api: fakeApi(), storage, now: () => 1000, schedule: noTimer })
  assert.equal(values.has(ADMIN_SESSION_STORAGE_KEY), false)
  assert.equal(session.isAuthenticated.value, false)
  await session.signIn(credentials)
  assert.equal(isReadonly(session.state), true)
  assert.equal(isReadonly(session.state.value), true)
  assert.deepEqual(session.state.value, { username: 'school-admin', csrfToken: 'a'.repeat(43), expiresAt: 901_000, accessExpiresAt: 301_000, absoluteExpiresAt: 1_801_000 })
  assert.equal(session.getCsrfToken(), 'a'.repeat(43))
  assert.deepEqual([...values], [['unrelated-preference', 'keep']])
  assert.equal(Object.hasOwn(session.state.value!, 'accessToken'), false)
  session.dispose()
})

test('restores by asking the server after reload and coalesces and caches completed checks', async () => {
  let reads = 0
  const response = deferred<BrowserSessionResponse>()
  const session = createAdminSession({ api: fakeApi({ getSession: async () => { reads++; return response.promise } }), schedule: noTimer })
  const first = session.restore()
  assert.equal(session.restore(), first)
  assert.equal(session.isRestoring.value, true)
  response.resolve(metadata())
  await first
  assert.equal(reads, 1)
  assert.equal(session.isRestoring.value, false)
  await session.restore()
  assert.equal(reads, 1)
  const reloaded = createAdminSession({ api: fakeApi(), schedule: noTimer })
  assert.equal(reloaded.isAuthenticated.value, false)
  await reloaded.restore()
  assert.equal(reloaded.state.value?.username, 'school-admin')
  session.dispose(); reloaded.dispose()
})

test('anonymous checks return unauthenticated while backend errors support explicit retry', async () => {
  const anonymous = createAdminSession({ api: fakeApi({ getSession: async () => { throw new ApiError('Sign in', { status: 401 }) } }), schedule: noTimer })
  assert.equal(await anonymous.restore(), null)
  assert.equal(anonymous.restoreError.value, '')
  let requests = 0
  const error = new ApiError('Render may need up to one minute to wake.', { status: 503 })
  const session = createAdminSession({ api: fakeApi({ getSession: async () => { requests++; if (requests === 1) throw error; return metadata() } }), schedule: noTimer })
  await assert.rejects(session.restore(), (cause: unknown) => cause === error)
  assert.equal(session.state.value, null)
  assert.equal(session.restoreError.value, error.message)
  await session.restore()
  assert.equal(requests, 1, 'Redirecting to login must not automatically retry a failed session check')
  await session.restore(true)
  assert.equal(requests, 2)
  assert.equal(session.isAuthenticated.value, true)
  assert.equal(session.restoreError.value, '')
  session.dispose()
})

test('sign-in verifies cookie acceptance and explains blocked cookies without authenticating', async () => {
  const calls: string[] = []
  const session = createAdminSession({ api: fakeApi({ login: async (body) => { assert.deepEqual(body, credentials); calls.push('login'); return metadata() }, getSession: async () => { calls.push('check-cookie'); throw new ApiError('Missing cookie', { status: 401 }) } }), schedule: noTimer })
  await assert.rejects(session.signIn(credentials), /browser could not keep your admin session/)
  assert.deepEqual(calls, ['login', 'check-cookie'])
  assert.equal(session.state.value, null)
  const invalid = createAdminSession({ api: fakeApi({ login: async () => { throw new ApiError('Incorrect password', { status: 401 }) } }), schedule: noTimer })
  await assert.rejects(invalid.signIn(credentials), /Incorrect password/)
})

test('sign-out revokes on the server before clearing memory and failures preserve a retryable session', async () => {
  let fail = true
  let requests = 0
  const session = createAdminSession({ api: fakeApi({ logout: async (csrf) => { requests++; assert.equal(csrf, 'a'.repeat(43)); if (fail) throw new ApiError('Network unavailable') } }), schedule: noTimer })
  await session.signIn(credentials)
  await assert.rejects(session.signOut(), /Network unavailable/)
  assert.equal(session.isAuthenticated.value, true)
  fail = false
  await session.signOut()
  assert.equal(requests, 2)
  assert.equal(session.state.value, null)
  assert.equal(session.getCsrfToken(), null)
})

test('401 during sign-out means the server session has already ended', async () => {
  const session = createAdminSession({ api: fakeApi({ logout: async () => { throw new ApiError('Expired', { status: 401 }) } }), schedule: noTimer })
  await session.signIn(credentials)
  await session.signOut()
  assert.equal(session.state.value, null)
})

test('expiry updates reactive state and rejects expired metadata even before a delayed timer', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(1000)
  const session = createAdminSession({ api: fakeApi({ getSession: async () => metadata({ expiresIn: 2 }) }) })
  onTestFinished(() => session.dispose())
  await session.signIn(credentials)
  vi.advanceTimersByTime(1999)
  assert.equal(session.isAuthenticated.value, true)
  vi.advanceTimersByTime(1)
  assert.equal(session.state.value, null)
  let now = 1000
  const delayed = createAdminSession({ api: fakeApi({ getSession: async () => metadata({ expiresIn: 1 }) }), now: () => now, schedule: noTimer })
  await delayed.signIn(credentials)
  now = 2000
  assert.equal(delayed.getCsrfToken(), null)
})

test('old expiry callbacks cannot clear a replacement session', async () => {
  const jobs: Array<{ callback: () => void; cancelled: boolean }> = []
  let response = metadata({ username: 'first-admin', expiresIn: 1 })
  const session = createAdminSession({ api: fakeApi({ getSession: async () => response }), schedule: (callback) => { const job = { callback, cancelled: false }; jobs.push(job); return () => { job.cancelled = true } } })
  await session.signIn(credentials)
  response = metadata({ username: 'second-admin', csrfToken: 'b'.repeat(43) })
  await session.signIn(credentials)
  assert.equal(jobs[0]!.cancelled, true)
  jobs[0]!.callback()
  assert.equal(session.state.value?.username, 'second-admin')
  session.invalidate()
  jobs[1]!.callback()
  assert.equal(session.state.value, null)
})

test('stale restore and logout responses cannot overwrite a newer login', async () => {
  const oldRead = deferred<BrowserSessionResponse>()
  const oldLogout = deferred<void>()
  let reads = 0
  let latest = metadata({ username: 'new-admin', csrfToken: 'b'.repeat(43) })
  const session = createAdminSession({ api: fakeApi({ getSession: async () => ++reads === 1 ? oldRead.promise : latest, logout: async () => oldLogout.promise }), schedule: noTimer })
  const restoring = session.restore()
  await Promise.resolve()
  await session.signIn(credentials)
  oldRead.resolve(metadata({ username: 'old-admin' }))
  await restoring
  assert.equal(session.state.value?.username, 'new-admin')
  const signingOut = session.signOut()
  await Promise.resolve()
  latest = metadata({ username: 'newest-admin', csrfToken: 'c'.repeat(43) })
  await session.signIn(credentials)
  oldLogout.resolve()
  await signingOut
  assert.equal(session.state.value?.username, 'newest-admin')
  session.dispose()
})

test('stale logins and cancelled or disposed checks cannot resurrect authentication', async () => {
  const oldLogin = deferred<BrowserSessionResponse>()
  let logins = 0
  const session = createAdminSession({ api: fakeApi({ login: async () => ++logins === 1 ? oldLogin.promise : metadata() }), schedule: noTimer })
  const first = session.signIn(credentials)
  await session.signIn(credentials)
  oldLogin.resolve(metadata({ username: 'obsolete-admin' }))
  await first
  assert.equal(session.state.value?.username, 'school-admin')
  session.dispose()
  for (const action of ['cancel', 'dispose', 'invalidate'] as const) {
    const response = deferred<BrowserSessionResponse>()
    const controller = new AbortController()
    const pending = createAdminSession({ api: fakeApi({ getSession: async () => response.promise }), schedule: noTimer })
    const check = pending.restore(false, controller.signal)
    if (action === 'cancel') controller.abort(); else pending[action]()
    response.resolve(metadata())
    await check
    assert.equal(pending.state.value, null)
  }
})

test('invalid session metadata and exposed bearer fields cannot establish a session', async () => {
  for (const value of [null, {}, { ...metadata(), accessToken: 'must-not-be-exposed' }, { ...metadata(), csrfToken: 'bad' }, { ...metadata(), expiresIn: 0 }, { ...metadata(), expiresIn: 901 }, { ...metadata(), username: '' }]) {
    const invalid = value as BrowserSessionResponse
    const login = createAdminSession({ api: fakeApi({ login: async () => invalid }), schedule: noTimer })
    await assert.rejects(login.signIn(credentials), TypeError)
    assert.equal(login.state.value, null)
    const restore = createAdminSession({ api: fakeApi({ getSession: async () => invalid }), schedule: noTimer })
    await assert.rejects(restore.restore(), TypeError)
    assert.equal(restore.state.value, null)
  }
})

test('blocked storage and SSR do not prevent cookie sessions or read localStorage', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  try {
    for (const browser of [undefined, { get sessionStorage() { throw new DOMException('Blocked', 'SecurityError') } }, { sessionStorage: { removeItem() { throw new DOMException('Blocked', 'SecurityError') } }, get localStorage() { return assert.fail('Do not use localStorage') } }]) {
      Reflect.deleteProperty(globalThis, 'window')
      if (browser) Object.defineProperty(globalThis, 'window', { configurable: true, value: browser })
      const session = createAdminSession({ api: fakeApi(), schedule: noTimer })
      await session.signIn(credentials)
      assert.equal(session.isAuthenticated.value, true)
      await session.signOut()
      assert.equal(session.state.value, null)
    }
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('access expiry never polls or refreshes in the background and idle expiry signs out', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(1000)
  let refreshes = 0
  let activities = 0
  const session = createAdminSession({ api: fakeApi({ refresh: async () => { refreshes++; return metadata() }, recordActivity: async () => { activities++; return metadata() } }) })
  onTestFinished(() => session.dispose())
  await session.signIn(credentials)
  vi.advanceTimersByTime(300_000)
  assert.equal(session.isAuthenticated.value, true)
  assert.equal(refreshes, 0); assert.equal(activities, 0)
  vi.advanceTimersByTime(600_000)
  assert.equal(session.isAuthenticated.value, false)
  assert.equal(refreshes, 0); assert.equal(activities, 0)
})

test('a user request coalesces refresh and preserves deadlines until explicit activity', async () => {
  let now = 1000
  let server = metadata()
  let refreshes = 0
  let activities = 0
  const session = createAdminSession({ now: () => now, schedule: noTimer, api: fakeApi({ getSession: async () => server, refresh: async () => { refreshes++; return server = metadata({ expiresIn: 600, absoluteExpiresIn: 1500 }) }, recordActivity: async () => { activities++; return server = metadata({ expiresIn: 900, absoluteExpiresIn: 1500 }) } }) })
  await session.signIn(credentials)
  now += 300_000
  server = metadata({ expiresIn: 600, accessExpiresIn: 0, absoluteExpiresIn: 1500 })
  const first = session.ensureAccess()
  assert.equal(session.ensureAccess(), first)
  assert.equal(await first, 'a'.repeat(43))
  assert.equal(refreshes, 1); assert.equal(activities, 0)
  assert.equal(session.state.value?.expiresAt, 901_000)
  assert.equal(session.state.value?.absoluteExpiresAt, 1_801_000)
  await session.recordActivity()
  assert.equal(activities, 1)
  assert.equal(session.state.value?.expiresAt, 1_201_000)
  await session.recordActivity()
  assert.equal(activities, 1, 'No trailing timer or excessive activity reports')
  session.dispose()
})

test('two tabs serialize rotation and check cookies again before spending a refresh token', async () => {
  const lock = originLock()
  let server = metadata({ accessExpiresIn: 0 })
  let refreshes = 0
  const api = fakeApi({ getSession: async () => server, refresh: async () => { refreshes++; return server = metadata() } })
  const first = createAdminSession({ api, schedule: noTimer, withRefreshLock: lock })
  const second = createAdminSession({ api, schedule: noTimer, withRefreshLock: lock })
  await Promise.all([first.restore(), second.restore()])
  await Promise.all([first.ensureAccess(), second.ensureAccess()])
  assert.equal(refreshes, 1)
  first.dispose(); second.dispose()
})

test('logout waits for rotation so a late refresh cannot restore cookies', async () => {
  const lock = originLock()
  const refresh = deferred<BrowserSessionResponse>()
  const started = deferred<void>()
  const calls: string[] = []
  const session = createAdminSession({ schedule: noTimer, withRefreshLock: lock, api: fakeApi({ getSession: async () => metadata({ accessExpiresIn: 0 }), refresh: async () => { calls.push('refresh-start'); started.resolve(); const response = await refresh.promise; calls.push('refresh-end'); return response }, logout: async () => { calls.push('logout') } }) })
  await session.restore()
  const pendingRefresh = session.ensureAccess()
  await started.promise
  const pendingLogout = session.signOut()
  assert.deepEqual(calls, ['refresh-start'])
  refresh.resolve(metadata())
  await Promise.all([pendingRefresh, pendingLogout])
  assert.deepEqual(calls, ['refresh-start', 'refresh-end', 'logout'])
  assert.equal(session.state.value, null)
})

test('rejected refresh clears authentication but an uncertain refresh is not automatically retried', async () => {
  for (const status of [401, 503, undefined]) {
    let calls = 0
    const session = createAdminSession({ schedule: noTimer, api: fakeApi({ getSession: async () => metadata({ accessExpiresIn: 0 }), refresh: async () => { calls++; throw new ApiError('Refresh failed', status === undefined ? {} : { status }) } }) })
    await session.restore()
    await assert.rejects(session.ensureAccess(), /Refresh failed/)
    assert.equal(calls, 1)
    assert.equal(session.isAuthenticated.value, status !== 401)
    session.dispose()
  }
})
