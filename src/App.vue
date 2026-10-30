<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppIcon from './components/AppIcon.vue'
import AppNavbar from './components/AppNavbar.vue'
import AppFooter from './components/AppFooter.vue'

const route = useRoute()
const helpDialog = ref<HTMLDialogElement | null>(null)

function focusMain() {
  document.getElementById('main-content')?.focus()
}

watch(() => route.name, async (name, previous) => {
  document.title = name === 'documentation'
    ? 'API Documentation · Currency Quiz'
    : name === 'not-found' ? 'Page not found · Currency Quiz' : 'Currency Quiz'
  if (previous === undefined) return
  await nextTick()
  focusMain()
}, { immediate: true })
</script>

<template>
  <a href="#main-content" class="skip-link" @click.prevent="focusMain">Skip to content</a>
  <div class="app-shell">
    <AppNavbar @show-help="helpDialog?.showModal()" />

    <RouterView v-slot="{ Component }">
      <KeepAlive include="QuizView">
        <component :is="Component" />
      </KeepAlive>
    </RouterView>

    <AppFooter />
  </div>

  <dialog ref="helpDialog" class="box help-dialog" aria-labelledby="help-heading" @click="(event) => { if (event.target === helpDialog) helpDialog?.close() }">
    <button class="delete dialog-close" type="button" aria-label="Close instructions" @click="helpDialog?.close()"></button>
    <span class="state-icon"><AppIcon name="globe" /></span>
    <p class="eyebrow">YOUR QUICK FIELD GUIDE</p>
    <h2 id="help-heading" class="panel-title">A world of curiosity.</h2>
    <ol class="help-steps"><li>Choose how many questions you’d like to answer.</li><li>Select one answer, then check it. Each question counts once.</li><li>Move to the next question and see your final score at the end.</li></ol>
    <p class="muted">There’s no timer and no account to create. Questions are shuffled for each new round. You’ll see whether you got an answer right; correct answers stay with the quiz service.</p>
    <button class="button is-primary primary-action" type="button" @click="helpDialog?.close()">Got it <AppIcon name="check" /></button>
  </dialog>
</template>
