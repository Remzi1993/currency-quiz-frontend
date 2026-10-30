<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import AppIcon from './components/AppIcon.vue'

const route = useRoute()
const helpDialog = ref<HTMLDialogElement | null>(null)

function focusMain() {
  document.getElementById('main-content')?.focus()
}

watch(() => route.name, async (name, previous) => {
  document.title = name === 'documentation' ? 'API Documentation · Currency Quiz' : 'Currency Quiz'
  if (previous === undefined) return
  await nextTick()
  focusMain()
}, { immediate: true })
</script>

<template>
  <a href="#main-content" class="skip-link" @click.prevent="focusMain">Skip to content</a>
  <div class="app-shell">
    <header class="site-header">
      <RouterLink to="/" class="brand" aria-label="Currency Quiz home">
        <span class="brand-mark"><AppIcon name="globe" /></span>
        <span>currency<span class="brand-light">quiz</span><span class="brand-dot">.</span></span>
      </RouterLink>
      <nav class="site-navigation" aria-label="Main navigation">
        <RouterLink to="/" class="navigation-link">Quiz</RouterLink>
        <RouterLink to="/documentation" class="navigation-link">Documentation</RouterLink>
      </nav>
      <button class="button is-ghost help-button" type="button" @click="helpDialog?.showModal()">
        <AppIcon name="info" /> <span>How to play</span>
      </button>
    </header>

    <RouterView v-slot="{ Component }">
      <KeepAlive include="QuizView">
        <component :is="Component" />
      </KeepAlive>
    </RouterView>

    <footer class="site-footer"><span>Made for a little everyday discovery.</span><span>Currency Quiz <span class="footer-star">✳</span> Stay curious.</span></footer>
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

<style scoped>
.site-navigation {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.navigation-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 10px 14px;
  border-radius: 7px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  transition: background .15s, color .15s;
}

.navigation-link:hover {
  background: #edf1e6;
  color: var(--green);
}

.navigation-link.router-link-active {
  background: #e8eedf;
  color: var(--green);
}

@media (max-width: 600px) {
  .site-header {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 14px 8px;
    padding-block: 20px 14px;
  }

  .site-navigation {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: center;
    margin-left: 0;
  }

  .navigation-link {
    flex: 1;
    max-width: 190px;
  }

  .help-button {
    grid-column: 2;
    grid-row: 1;
  }
}
</style>
