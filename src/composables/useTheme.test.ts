import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { isReadonly } from 'vue'
import { createThemeController, THEME_STORAGE_KEY, type ThemePreference, type ThemeStorage } from './useTheme.ts'

function fixture(stored?: string, systemDark = false, failStorage = false) {
  const values = new Map<string, string>()
  if (stored !== undefined) values.set(THEME_STORAGE_KEY, stored)
  const storage: ThemeStorage = {
    getItem: (key) => { if (failStorage) throw new Error('Storage blocked'); return values.get(key) ?? null },
    setItem: (key, value) => { if (failStorage) throw new Error('Storage blocked'); values.set(key, value) },
    removeItem: (key) => { if (failStorage) throw new Error('Storage blocked'); values.delete(key) },
  }
  const attributes = new Map<string, string>()
  const root = {
    setAttribute: (key: string, value: string) => { attributes.set(key, value) },
    removeAttribute: (key: string) => { attributes.delete(key) },
    style: { colorScheme: '' },
  }
  const metas = [{ content: '#f6f7f2' }, { content: '#111b17' }]
  const mediaListeners = new Set<() => void>()
  const media = {
    matches: systemDark,
    addEventListener: (_type: 'change', listener: () => void) => { mediaListeners.add(listener) },
    removeEventListener: (_type: 'change', listener: () => void) => { mediaListeners.delete(listener) },
  }
  type StorageChange = { key: string | null; newValue: string | null; storageArea?: ThemeStorage | null }
  const storageListeners = new Set<(event: StorageChange) => void>()
  const theme = createThemeController({
    storage, media, root, themeColorMetas: metas,
    subscribeStorage: (listener) => { storageListeners.add(listener); return () => { storageListeners.delete(listener) } },
  })
  return {
    theme, storage, values, root, attributes, metas, media, mediaListeners, storageListeners,
    changeSystem(dark: boolean) { media.matches = dark; for (const listener of mediaListeners) listener() },
    changeStorage(event: StorageChange) { for (const listener of storageListeners) listener(event) },
  }
}

test('defaults to System without an HTML override and installs listeners once', () => {
  const state = fixture(undefined, true)
  state.theme.initialize()
  state.theme.initialize()
  assert.equal(isReadonly(state.theme.themePreference), true)
  assert.equal(isReadonly(state.theme.resolvedTheme), true)
  assert.equal(state.theme.themePreference.value, 'system')
  assert.equal(state.theme.resolvedTheme.value, 'dark')
  assert.equal(state.attributes.has('data-theme'), false)
  assert.equal(state.root.style.colorScheme, '')
  assert.deepEqual(state.metas.map((meta) => meta.content), ['#111b17', '#111b17'])
  assert.equal(state.mediaListeners.size, 1)
  assert.equal(state.storageListeners.size, 1)
  state.theme.dispose()
})

test('restores each explicit preference instead of the opposing system setting', () => {
  for (const preference of ['light', 'dark'] as const) {
    const state = fixture(preference, preference === 'light')
    state.theme.initialize()
    assert.equal(state.theme.themePreference.value, preference)
    assert.equal(state.theme.resolvedTheme.value, preference)
    assert.equal(state.attributes.get('data-theme'), preference)
    assert.equal(state.root.style.colorScheme, preference)
    assert.deepEqual(state.metas.map((meta) => meta.content), Array(2).fill(preference === 'dark' ? '#111b17' : '#f6f7f2'))
    state.theme.dispose()
  }
})

test('System follows live OS changes while explicit choices remain fixed', () => {
  const state = fixture()
  state.theme.initialize()
  state.changeSystem(true)
  assert.equal(state.theme.resolvedTheme.value, 'dark')
  state.theme.setPreference('light')
  assert.equal(state.values.get(THEME_STORAGE_KEY), 'light')
  assert.equal(state.attributes.get('data-theme'), 'light')
  state.changeSystem(false)
  state.changeSystem(true)
  assert.equal(state.theme.resolvedTheme.value, 'light')
  state.theme.setPreference('system')
  assert.equal(state.theme.resolvedTheme.value, 'dark')
  assert.equal(state.values.has(THEME_STORAGE_KEY), false)
  assert.equal(state.attributes.has('data-theme'), false)
  assert.equal(state.root.style.colorScheme, '')
  state.changeSystem(false)
  assert.equal(state.theme.resolvedTheme.value, 'light')
  state.theme.dispose()
})

test('invalid stored values are discarded and do not force a scheme', () => {
  for (const stored of ['auto', '', 'DARK', '{"theme":"dark"}', 'null']) {
    const state = fixture(stored, true)
    state.theme.initialize()
    assert.equal(state.theme.themePreference.value, 'system')
    assert.equal(state.theme.resolvedTheme.value, 'dark')
    assert.equal(state.values.has(THEME_STORAGE_KEY), false)
    state.theme.setPreference('invalid' as ThemePreference)
    assert.equal(state.theme.themePreference.value, 'system')
    state.theme.dispose()
  }
})

test('a blocked storage API still allows session-local choices and returning to System', () => {
  const state = fixture(undefined, true, true)
  assert.doesNotThrow(() => state.theme.initialize())
  assert.doesNotThrow(() => state.theme.setPreference('light'))
  assert.equal(state.theme.resolvedTheme.value, 'light')
  assert.equal(state.attributes.get('data-theme'), 'light')
  state.theme.setPreference('system')
  assert.equal(state.theme.resolvedTheme.value, 'dark')
  assert.equal(state.root.style.colorScheme, '')
  state.theme.dispose()
})

test('cross-tab changes update the preference, ignoring other keys and storage areas', () => {
  const state = fixture(undefined, true)
  state.theme.initialize()
  state.changeStorage({ key: 'unrelated', newValue: 'light', storageArea: state.storage })
  assert.equal(state.theme.themePreference.value, 'system')
  const unrelatedStorage: ThemeStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  state.changeStorage({ key: THEME_STORAGE_KEY, newValue: 'light', storageArea: unrelatedStorage })
  assert.equal(state.theme.themePreference.value, 'system')
  state.changeStorage({ key: THEME_STORAGE_KEY, newValue: 'light', storageArea: state.storage })
  assert.equal(state.theme.resolvedTheme.value, 'light')
  state.changeStorage({ key: THEME_STORAGE_KEY, newValue: 'dark', storageArea: state.storage })
  assert.equal(state.theme.resolvedTheme.value, 'dark')
  state.changeStorage({ key: null, newValue: null, storageArea: state.storage })
  assert.equal(state.theme.themePreference.value, 'system')
  assert.equal(state.attributes.has('data-theme'), false)
  state.theme.dispose()
})

test('cleanup removes both listeners and initialization is safe without a browser', () => {
  const state = fixture()
  state.theme.initialize()
  state.theme.dispose()
  assert.equal(state.mediaListeners.size, 0)
  assert.equal(state.storageListeners.size, 0)
  const theme = createThemeController({ storage: null, media: null, root: null, themeColorMetas: [] })
  assert.doesNotThrow(() => theme.initialize())
  assert.equal(theme.resolvedTheme.value, 'light')
  assert.doesNotThrow(() => theme.setPreference('dark'))
  assert.equal(theme.resolvedTheme.value, 'dark')
  theme.dispose()
})

const bootstrap = readFileSync(new URL('../../public/theme-init.js', import.meta.url), 'utf8')

test('the early bootstrap applies stored overrides and chrome colors before Vue initializes', () => {
  for (const preference of ['light', 'dark'] as const) {
    const state = fixture(preference, preference === 'light')
    runInNewContext(bootstrap, {
      window: { localStorage: state.storage, matchMedia: () => state.media },
      document: { documentElement: state.root, querySelectorAll: () => state.metas },
    })
    assert.equal(state.attributes.get('data-theme'), preference)
    assert.equal(state.root.style.colorScheme, preference)
    assert.deepEqual(state.metas.map((meta) => meta.content), Array(2).fill(preference === 'dark' ? '#111b17' : '#f6f7f2'))
  }
})

test('the early bootstrap respects System, invalid preferences, and blocked storage', () => {
  for (const [stored, blocked] of [[undefined, false], ['system', false], ['invalid', false], [undefined, true]] as const) {
    const state = fixture(stored, true, blocked)
    runInNewContext(bootstrap, {
      window: { localStorage: state.storage, matchMedia: () => state.media },
      document: { documentElement: state.root, querySelectorAll: () => state.metas },
    })
    assert.equal(state.attributes.has('data-theme'), false)
    assert.equal(state.root.style.colorScheme, '')
    assert.deepEqual(state.metas.map((meta) => meta.content), ['#111b17', '#111b17'])
  }
})
