import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isReadonly } from 'vue'
import type { TokenResponse } from '../../shared/generated/typescript/schema'
import {
  ADMIN_SESSION_STORAGE_KEY,
  createAdminSession,
  type AdminSessionStorage,
} from './adminSession.ts'

function memoryStorage(encoded?: string) {
  const values = new Map<string, string>()
  if (encoded !== undefined) values.set(ADMIN_SESSION_STORAGE_KEY, encoded)
  const storage: AdminSessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
  }
  return { storage, values }
}

function token(overrides: Partial<TokenResponse> = {}): TokenResponse {
  return { accessToken: 'test.access-token.signature', tokenType: 'Bearer', expiresIn: 3600, ...overrides }
}

const noTimer = () => () => {}

test('sign-in exposes a readonly session and stores only its tab-scoped bearer details', () => {
  const { storage, values } = memoryStorage()
  const session = createAdminSession({ storage, now: () => 1000, schedule: noTimer })
  session.signIn('  school-admin  ', token())
  assert.equal(isReadonly(session.state), true)
  assert.equal(isReadonly(session.state.value), true)
  assert.equal(session.isAuthenticated.value, true)
  assert.equal(session.getToken(), 'test.access-token.signature')
  assert.deepEqual(session.state.value, {
    username: 'school-admin', accessToken: 'test.access-token.signature', expiresAt: 3_601_000,
  })
  assert.deepEqual(JSON.parse(values.get(ADMIN_SESSION_STORAGE_KEY)!), {
    version: 1, username: 'school-admin', accessToken: 'test.access-token.signature', expiresAt: 3_601_000,
  })
  assert.deepEqual([...values.keys()], [ADMIN_SESSION_STORAGE_KEY])
  session.dispose()
})

test('restores a valid unexpired session after refreshing the tab', () => {
  const { storage } = memoryStorage()
  const original = createAdminSession({ storage, now: () => 1000, schedule: noTimer })
  original.signIn('school-admin', token())
  original.dispose()
  const restored = createAdminSession({ storage, now: () => 2000, schedule: noTimer })
  assert.equal(restored.isAuthenticated.value, true)
  assert.equal(restored.getToken(), original.getToken())
  assert.deepEqual(restored.state.value, original.state.value)
  restored.dispose()
})

test('automatically clears reactive state and browser storage exactly at expiration', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 })
  const { storage, values } = memoryStorage()
  const session = createAdminSession({ storage })
  t.after(() => session.dispose())
  session.signIn('school-admin', token({ expiresIn: 2 }))
  assert.equal(session.isAuthenticated.value, true)
  t.mock.timers.tick(1999)
  assert.notEqual(session.state.value, null)
  t.mock.timers.tick(1)
  // These checks intentionally do not call getToken: the timer must update the UI itself.
  assert.equal(session.state.value, null)
  assert.equal(session.isAuthenticated.value, false)
  assert.equal(values.has(ADMIN_SESSION_STORAGE_KEY), false)
})

test('a restored session also expires automatically without an API call', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 })
  const { storage, values } = memoryStorage(JSON.stringify({
    version: 1, accessToken: 'restored-token', username: 'school-admin', expiresAt: 2500,
  }))
  const session = createAdminSession({ storage })
  t.after(() => session.dispose())
  assert.equal(session.isAuthenticated.value, true)
  t.mock.timers.tick(1500)
  assert.equal(session.state.value, null)
  assert.equal(session.isAuthenticated.value, false)
  assert.equal(values.has(ADMIN_SESSION_STORAGE_KEY), false)
})

test('getToken immediately clears an expired session even if its timer has not run', () => {
  let now = 1000
  const { storage, values } = memoryStorage()
  const session = createAdminSession({ storage, now: () => now, schedule: noTimer })
  session.signIn('school-admin', token({ expiresIn: 1 }))
  now = 2000
  assert.equal(session.getToken(), null)
  assert.equal(session.state.value, null)
  assert.equal(session.isAuthenticated.value, false)
  assert.equal(values.has(ADMIN_SESSION_STORAGE_KEY), false)
})

test('new sign-ins replace the old expiry timer and sign-out cancels the current timer', () => {
  const jobs: Array<{ callback: () => void; delay: number; cancelled: boolean }> = []
  let now = 1000
  const { storage, values } = memoryStorage()
  values.set('unrelated-preference', 'keep')
  const session = createAdminSession({ storage, now: () => now, schedule: (callback, delay) => {
    const job = { callback, delay, cancelled: false }
    jobs.push(job)
    return () => { job.cancelled = true }
  } })
  session.signIn('first-admin', token({ expiresIn: 1 }))
  session.signIn('second-admin', token({ accessToken: 'replacement-token', expiresIn: 5 }))
  assert.equal(jobs[0]!.cancelled, true)
  assert.equal(jobs[1]!.delay, 5000)
  now = 2000
  jobs[0]!.callback()
  assert.equal(session.state.value?.username, 'second-admin')
  assert.equal(session.getToken(), 'replacement-token')
  session.signOut()
  assert.equal(jobs[1]!.cancelled, true)
  assert.equal(session.state.value, null)
  assert.equal(session.getToken(), null)
  assert.equal(session.isAuthenticated.value, false)
  assert.equal(values.has(ADMIN_SESSION_STORAGE_KEY), false)
  assert.equal(values.get('unrelated-preference'), 'keep')
  jobs[1]!.callback()
  assert.equal(session.state.value, null)
})

test('discards malformed, expired, excessive-lifetime and unexpected stored session fields', () => {
  const valid = { version: 1, accessToken: 'stored-token', username: 'school-admin', expiresAt: 2000 }
  const invalid: unknown[] = [
    null, [], {}, { ...valid, version: 2 }, { ...valid, password: 'must-not-be-stored' },
    { ...valid, accessToken: '' }, { ...valid, accessToken: 'invalid token' },
    { ...valid, accessToken: 'x'.repeat(16_385) }, { ...valid, username: '' },
    { ...valid, username: '  ' }, { ...valid, username: 'x'.repeat(101) },
    { ...valid, expiresAt: 1000 }, { ...valid, expiresAt: 999 },
    { ...valid, expiresAt: 86_401_001 }, { ...valid, expiresAt: '2000' },
    { ...valid, expiresAt: 2000.5 }, { ...valid, expiresAt: Number.MAX_SAFE_INTEGER + 1 },
  ]
  for (const encoded of ['{broken JSON', ...invalid.map((value) => JSON.stringify(value))]) {
    const { storage, values } = memoryStorage(encoded)
    const session = createAdminSession({ storage, now: () => 1000, schedule: noTimer })
    assert.equal(session.state.value, null)
    assert.equal(session.getToken(), null)
    assert.equal(values.has(ADMIN_SESSION_STORAGE_KEY), false)
  }
})

test('rejects invalid login response values without storing an admin session', () => {
  const invalid: unknown[] = [
    null, {}, { ...token(), tokenType: 'Basic' }, { ...token(), accessToken: '' },
    { ...token(), accessToken: 'invalid\r\ntoken' }, { ...token(), accessToken: 'x'.repeat(16_385) },
    { ...token(), expiresIn: 0 }, { ...token(), expiresIn: -1 }, { ...token(), expiresIn: 1.5 },
    { ...token(), expiresIn: 86_401 }, { ...token(), expiresIn: Number.NaN },
    { ...token(), expiresIn: Number.POSITIVE_INFINITY }, { ...token(), expiresIn: '3600' },
  ]
  const { storage, values } = memoryStorage()
  const session = createAdminSession({ storage, now: () => 1000, schedule: noTimer })
  for (const response of invalid) {
    assert.throws(() => session.signIn('school-admin', response as TokenResponse), TypeError)
  }
  for (const username of ['', '   ', 'x'.repeat(101)]) {
    assert.throws(() => session.signIn(username, token()), TypeError)
  }
  assert.equal(session.state.value, null)
  assert.equal(values.has(ADMIN_SESSION_STORAGE_KEY), false)
})

test('blocked browser storage falls back to memory and sign-out still clears authentication', () => {
  const storage: AdminSessionStorage = {
    getItem: () => { throw new DOMException('Blocked', 'SecurityError') },
    setItem: () => { throw new DOMException('Quota exceeded', 'QuotaExceededError') },
    removeItem: () => { throw new DOMException('Blocked', 'SecurityError') },
  }
  const session = createAdminSession({ storage, now: () => 1000, schedule: noTimer })
  assert.doesNotThrow(() => session.signIn('school-admin', token()))
  assert.equal(session.isAuthenticated.value, true)
  assert.equal(session.getToken(), 'test.access-token.signature')
  assert.doesNotThrow(() => session.signOut())
  assert.equal(session.state.value, null)
})

test('default storage uses sessionStorage and safely handles SSR or browser access denial', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  try {
    Reflect.deleteProperty(globalThis, 'window')
    const ssr = createAdminSession({ schedule: noTimer })
    ssr.signIn('school-admin', token())
    assert.equal(ssr.isAuthenticated.value, true)
    ssr.signOut()

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { get sessionStorage() { throw new DOMException('Blocked', 'SecurityError') } },
    })
    const blocked = createAdminSession({ schedule: noTimer })
    assert.doesNotThrow(() => blocked.signIn('school-admin', token()))
    blocked.signOut()

    const { storage, values } = memoryStorage()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { sessionStorage: storage, get localStorage() { throw new Error('Local storage must not be used') } },
    })
    const browser = createAdminSession({ schedule: noTimer })
    browser.signIn('school-admin', token())
    assert.equal(values.has(ADMIN_SESSION_STORAGE_KEY), true)
    browser.signOut()
    assert.equal(values.has(ADMIN_SESSION_STORAGE_KEY), false)
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
