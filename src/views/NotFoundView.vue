<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
</script>

<template>
  <main id="main-content" class="not-found-page" tabindex="-1">
    <span class="state-icon"><AppIcon name="globe" /></span>
    <p class="eyebrow">404 · A SMALL DETOUR</p>
    <h1>This page is<br /><em>off the map.</em></h1>
    <p>The address may be incorrect, or the page may have moved. There’s still a world of questions to explore.</p>
    <div class="not-found-actions">
      <RouterLink class="button is-primary" to="/">Back to the quiz <AppIcon name="arrow" /></RouterLink>
      <RouterLink class="button is-light" to="/documentation">API documentation</RouterLink>
    </div>
  </main>
</template>

<style scoped>
.not-found-page {
  padding-block: 70px 90px;
  max-width: 620px;
  min-height: 65vh;
}

.not-found-page .eyebrow { margin-bottom: 19px; }
.not-found-page h1 { font-size: clamp(40px, 5vw, 60px); }
.not-found-page > p:last-of-type { margin-top: 25px; max-width: 430px; color: var(--muted); font-size: 14px; line-height: 1.9; }
.not-found-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
.not-found-actions .button { font-size: 12px; min-height: 43px; }
</style>
