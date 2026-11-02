<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId } from 'vue'
import AppIcon from './AppIcon.vue'
import { resolvedTheme, setThemePreference, themePreference } from '../composables/useTheme.ts'

const emit = defineEmits<{ open: [] }>()
const container = ref<HTMLElement | null>(null)
const toggle = ref<HTMLButtonElement | null>(null)
const isOpen = ref(false)
const panelId = useId()
const themes = [
  { mode: 'light', label: 'Light mode', name: 'Light', icon: 'sun' },
  { mode: 'dark', label: 'Dark mode', name: 'Dark', icon: 'moon' },
  { mode: 'system', label: 'System mode', name: 'System', icon: 'desktop' },
] as const
const selectedTheme = computed(() => themes.find(({ mode }) => mode === themePreference.value) ?? themes[2])
const toggleLabel = computed(() => `Theme: ${selectedTheme.value.name}`)
const toggleTitle = computed(() => themePreference.value === 'system'
  ? `${toggleLabel.value} (currently ${resolvedTheme.value})`
  : toggleLabel.value)

function close(restoreFocus = false) {
  isOpen.value = false
  if (restoreFocus) toggle.value?.focus()
}

function togglePanel() {
  isOpen.value = !isOpen.value
  if (isOpen.value) emit('open')
}

function selectTheme(mode: typeof themes[number]['mode']) {
  setThemePreference(mode)
  close(true)
}

function onPointerDown(event: PointerEvent) {
  if (event.target instanceof Node && !container.value?.contains(event.target)) close()
}

function onFocusIn(event: FocusEvent) {
  if (isOpen.value && event.target instanceof Node && !container.value?.contains(event.target)) close()
}

function onEscape(event: KeyboardEvent) {
  if (!isOpen.value) return
  event.stopPropagation()
  event.preventDefault()
  close(true)
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('focusin', onFocusIn)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('focusin', onFocusIn)
})
defineExpose({ close })
</script>

<template>
  <div ref="container" class="theme-selector" @keydown.esc="onEscape">
    <button
      ref="toggle"
      class="button theme-toggle"
      :class="{ 'is-active': isOpen }"
      type="button"
      :aria-label="toggleLabel"
      :title="toggleTitle"
      :aria-expanded="isOpen"
      :aria-controls="panelId"
      @click="togglePanel"
    ><AppIcon :name="selectedTheme.icon" /></button>
    <div v-show="isOpen" :id="panelId" class="theme-options" role="group" aria-label="Color theme">
      <p class="theme-heading">Appearance</p>
      <button
        v-for="theme in themes"
        :key="theme.mode"
        class="theme-option"
        :class="{ 'is-selected': themePreference === theme.mode }"
        type="button"
        :aria-pressed="themePreference === theme.mode"
        @click="selectTheme(theme.mode)"
      >
        <AppIcon :name="theme.icon" /><span>{{ theme.label }}</span><AppIcon v-if="themePreference === theme.mode" name="check" class="theme-check" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.theme-selector { position: relative; flex: none; }
.theme-toggle.button { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; min-height: 44px; padding: 0; border: 1px solid var(--line); border-radius: 10px; background: light-dark(#edf1e6, #22332a); color: var(--green); }
.theme-toggle.button:hover, .theme-toggle.button.is-active { border-color: light-dark(#b4c3a6, #688360); background: light-dark(#e8eedf, #2d4434); color: var(--green); }
.theme-toggle .app-icon { width: 20px; height: 20px; }
.theme-options { position: absolute; z-index: 35; top: calc(100% + 12px); right: 0; width: 192px; padding: 8px; border: 1px solid var(--line); border-radius: 12px; background: light-dark(#fffefa, #19251f); box-shadow: 0 8px 28px light-dark(#24392e14, #00000050); }
.theme-heading { margin: 4px 10px 8px; color: var(--muted); font-size: 10px; font-weight: 600; letter-spacing: .8px; text-transform: uppercase; }
.theme-option { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 10px; border: none; border-radius: 7px; background: transparent; color: var(--ink); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.theme-option:hover { background: light-dark(#edf1e6, #22332a); }
.theme-option.is-selected { background: light-dark(#e8eedf, #2d4434); color: var(--green); font-weight: 600; }
.theme-option .app-icon { width: 17px; height: 17px; }
.theme-option .theme-check { margin-left: auto; width: 15px; height: 15px; }

@media (max-width: 1023px) {
  .theme-options { top: auto; bottom: calc(100% + 20px); }
}
</style>
