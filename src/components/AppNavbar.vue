<script setup lang="ts">
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppIcon from './AppIcon.vue'
import ThemeSelector from './ThemeSelector.vue'

const emit = defineEmits<{ showHelp: [] }>()
const route = useRoute()
const brandIconUrl = `${import.meta.env.BASE_URL}favicon.svg`
const navbar = useTemplateRef<HTMLElement>('navbar')
const burger = useTemplateRef<HTMLButtonElement>('burger')
const themeSelector = useTemplateRef('themeSelector')
const menuOpen = ref(false)
let desktop: MediaQueryList | undefined

function closeMenu(restoreFocus = false) {
  menuOpen.value = false
  if (restoreFocus) burger.value?.focus()
}

function onPointerDown(event: PointerEvent) {
  if (event.target instanceof Node && !navbar.value?.contains(event.target)) closeMenu()
}

function onBreakpointChange(event: MediaQueryListEvent) {
  if (event.matches) closeMenu()
}

function showHelp() {
  closeMenu(true)
  emit('showHelp')
}

watch(() => route.fullPath, () => {
  closeMenu()
  themeSelector.value?.close()
})

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  desktop = window.matchMedia('(min-width: 1024px)')
  desktop.addEventListener('change', onBreakpointChange)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  if (desktop) desktop.removeEventListener('change', onBreakpointChange)
})
</script>

<template>
  <nav ref="navbar" class="navbar is-fixed-bottom-touch has-shadow app-navbar" aria-label="Main navigation" @keydown.esc.stop.prevent="closeMenu(true)">
    <div class="navbar-brand">
      <RouterLink to="/" class="navbar-item brand" aria-label="Currency Quiz home" @click="closeMenu()">
        <img class="brand-mark" :src="brandIconUrl" width="40" height="40" alt="" />
        <span>Currency <span class="brand-light">Quiz</span></span>
      </RouterLink>
      <ThemeSelector ref="themeSelector" class="navbar-theme-selector" @open="closeMenu()" />
      <button
        ref="burger"
        class="navbar-burger"
        :class="{ 'is-active': menuOpen }"
        type="button"
        :aria-label="menuOpen ? 'Close navigation' : 'Open navigation'"
        :aria-expanded="menuOpen"
        aria-controls="main-navigation-menu"
        @click="() => { themeSelector?.close(); menuOpen = !menuOpen }"
      >
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
      </button>
    </div>

    <div id="main-navigation-menu" class="navbar-menu" :class="{ 'is-active': menuOpen }">
      <div class="navbar-start">
        <RouterLink to="/" class="navbar-item navigation-link" :class="{ 'is-active': route.name === 'quiz' }" @click="closeMenu(true)">
          <AppIcon name="flag" /><span>Quiz</span>
        </RouterLink>
        <RouterLink to="/documentation" class="navbar-item navigation-link" :class="{ 'is-active': route.name === 'documentation' }" @click="closeMenu(true)">
          <AppIcon name="book" /><span>Documentation</span>
        </RouterLink>
        <RouterLink to="/admin" class="navbar-item navigation-link" :class="{ 'is-active': route.name === 'admin' || route.name === 'admin-login' }" @click="closeMenu(true)">
          <AppIcon name="lock" /><span>Admin</span>
        </RouterLink>
      </div>
      <div class="navbar-end">
        <div class="navbar-item help-item">
          <button class="button is-ghost help-button" type="button" @click="showHelp">
            <AppIcon name="info" /><span>How to play</span>
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.app-navbar {
  --bulma-navbar-background-color: light-dark(#f6f7f2, #111b17);
  --bulma-navbar-burger-color: var(--green);
  --bulma-navbar-item-color: var(--green);
  --bulma-navbar-item-img-max-height: none;
  min-height: 104px;
  gap: 24px;
  border-bottom: 1px solid var(--line);
  background: var(--bulma-navbar-background-color);
}
.app-navbar.has-shadow { box-shadow: none; }
.navbar-brand { display: contents; }
.brand.navbar-item { padding: 0; background: none; color: var(--green); order: 1; align-self: center; }
.brand-mark { display: block; flex: none; width: 40px; height: 40px; }
.navbar-menu { align-items: center; gap: 24px; order: 2; }
.navbar-theme-selector { order: 3; align-self: center; }
.navbar-start { align-items: center; gap: 8px; margin-left: auto; margin-right: 0; }
.navbar-end { align-items: center; margin-left: auto; }
.navigation-link {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 44px;
  padding: 10px 15px;
  border-radius: 8px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  transition: background .15s, color .15s;
}
.navigation-link .app-icon { width: 17px; height: 17px; }
.navigation-link:hover { background: light-dark(#edf1e6, #22332a); color: var(--green); }
.navigation-link.is-active { background: light-dark(#e8eedf, #2d4434); color: var(--green); }
.help-item { padding: 0; }
.help-button { min-height: 44px; }
@media (max-width: 1023px) {
  .app-navbar {
    min-height: var(--mobile-navbar-height);
    padding: 0 max(20px, env(safe-area-inset-right)) env(safe-area-inset-bottom) max(20px, env(safe-area-inset-left));
    border-top: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 18px 18px 0 0;
  }
  .app-navbar.has-shadow { box-shadow: 0 -4px 28px light-dark(#24392e0d, #00000040); }
  .navbar-brand { min-height: calc(var(--mobile-navbar-height) - 1px); gap: 8px; display: flex; }
  .brand.navbar-item { font-size: 22px; gap: 10px; order: initial; }
  .navbar-theme-selector { order: initial; margin-left: auto; }
  .brand-mark { width: 34px; height: 34px; }
  .navbar-burger { width: 44px; height: 44px; background: light-dark(#e8eedf, #2d4434); border-radius: 10px; margin-inline: 0; }
  .navbar-menu {
    position: absolute;
    bottom: 100%;
    left: 12px;
    right: 12px;
    max-height: calc(100dvh - var(--mobile-navbar-height) - env(safe-area-inset-bottom) - 24px);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 10px;
    margin-bottom: 10px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: light-dark(#fffefa, #19251f);
    box-shadow: 0 -8px 36px light-dark(#24392e14, #00000050);
  }
  .navbar-start { display: grid; gap: 5px; }
  .navigation-link { min-height: 50px; padding-inline: 15px; font-size: 14px; }
  .navigation-link .app-icon { width: 19px; height: 19px; }
  .navbar-end { margin-top: 9px; padding-top: 9px; border-top: 1px solid var(--line); }
  .help-button { justify-content: flex-start; width: 100%; min-height: 50px; padding-inline: 15px; font-size: 13px; }
}
@media (max-width: 380px) {
  .brand.navbar-item { gap: 6px; font-size: 18px; }
  .brand-mark { width: 32px; height: 32px; }
}
</style>
