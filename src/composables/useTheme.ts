import { readonly, ref } from 'vue'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'
export type ThemeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

interface ThemeMedia {
  readonly matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

interface ThemeRoot {
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
  style: { colorScheme: string }
}

interface ThemeStorageEvent {
  key: string | null
  newValue: string | null
  storageArea?: ThemeStorage | null
}

interface ThemeOptions {
  storage?: ThemeStorage | null
  media?: ThemeMedia | null
  root?: ThemeRoot | null
  themeColorMetas?: Iterable<{ content: string }>
  subscribeStorage?: (listener: (event: ThemeStorageEvent) => void) => () => void
}

export const THEME_STORAGE_KEY = 'currency-quiz.theme.v1'
const themeColors: Record<ResolvedTheme, string> = { light: '#f6f7f2', dark: '#111b17' }

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

function browserStorage(): ThemeStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

function browserMedia(): ThemeMedia | null {
  try { return typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)') } catch { return null }
}

function subscribeBrowserStorage(listener: (event: ThemeStorageEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}

/** A theme override is optional; System leaves CSS and Bulma following the operating system. */
export function createThemeController(options: ThemeOptions = {}) {
  const preference = ref<ThemePreference>('system')
  const resolved = ref<ResolvedTheme>('light')
  let initialized = false
  let storage: ThemeStorage | null = null
  let media: ThemeMedia | null = null
  let root: ThemeRoot | null = null
  let themeColorMetas: Iterable<{ content: string }> = []
  let unsubscribeStorage: (() => void) | undefined

  function apply() {
    resolved.value = preference.value === 'system' ? (media?.matches ? 'dark' : 'light') : preference.value
    if (preference.value === 'system') {
      root?.removeAttribute('data-theme')
      if (root) root.style.colorScheme = ''
    } else {
      root?.setAttribute('data-theme', preference.value)
      if (root) root.style.colorScheme = preference.value
    }
    for (const meta of themeColorMetas) meta.content = themeColors[resolved.value]
  }

  function onSystemChange() {
    if (preference.value === 'system') apply()
  }

  function onStorageChange(event: ThemeStorageEvent) {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return
    if (event.storageArea && storage && event.storageArea !== storage) return
    preference.value = isThemePreference(event.newValue) ? event.newValue : 'system'
    apply()
  }

  function initialize() {
    if (initialized) return
    initialized = true
    storage = options.storage === undefined ? browserStorage() : options.storage
    media = options.media === undefined ? browserMedia() : options.media
    root = options.root === undefined ? (typeof document === 'undefined' ? null : document.documentElement) : options.root
    themeColorMetas = options.themeColorMetas ?? (typeof document === 'undefined' ? [] : document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))
    let stored: string | null = null
    try { stored = storage?.getItem(THEME_STORAGE_KEY) ?? null } catch { /* Storage may be unavailable. */ }
    preference.value = isThemePreference(stored) ? stored : 'system'
    if (stored !== null && !isThemePreference(stored)) {
      try { storage?.removeItem(THEME_STORAGE_KEY) } catch { /* A stale preference never blocks rendering. */ }
    }
    apply()
    media?.addEventListener('change', onSystemChange)
    unsubscribeStorage = (options.subscribeStorage ?? subscribeBrowserStorage)(onStorageChange)
  }

  function setPreference(mode: ThemePreference) {
    if (!isThemePreference(mode)) return
    initialize()
    preference.value = mode
    try {
      if (mode === 'system') storage?.removeItem(THEME_STORAGE_KEY)
      else storage?.setItem(THEME_STORAGE_KEY, mode)
    } catch { /* Keep the selection in memory when browser storage is blocked. */ }
    apply()
  }

  function dispose() {
    media?.removeEventListener('change', onSystemChange)
    unsubscribeStorage?.()
    unsubscribeStorage = undefined
    initialized = false
  }

  return { themePreference: readonly(preference), resolvedTheme: readonly(resolved), initialize, setPreference, dispose }
}

const theme = createThemeController()
export const themePreference = theme.themePreference
export const resolvedTheme = theme.resolvedTheme
export const initializeTheme = theme.initialize
export const setThemePreference = theme.setPreference
