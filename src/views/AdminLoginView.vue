<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { ApiError } from '../api/client.ts'
import { getAdminApi } from '../api/adminClient.ts'
import { adminSession } from '../composables/adminSession.ts'
import '../admin/admin.css'

const router = useRouter()
const route = useRoute()
const username = ref('')
const password = ref('')
const isSigningIn = ref(false)
const error = ref('')
const retryAt = ref(0)
const now = ref(Date.now())
const retrySeconds = computed(() => Math.max(0, Math.ceil((retryAt.value - now.value) / 1000)))
const notice = computed(() => route.query.reason === 'expired'
  ? 'Your admin session ended. Sign in again to continue.'
  : route.query.reason === 'signed-out' ? 'You have been signed out.' : '')
let controller: AbortController | undefined
let timer: ReturnType<typeof setInterval> | undefined

async function signIn() {
  if (isSigningIn.value || retrySeconds.value) return
  error.value = ''
  const name = username.value.trim()
  if (!name || name.length > 100 || !password.value.trim() || password.value.length > 1024) {
    error.value = 'Enter your admin username and password.'
    return
  }
  controller = new AbortController()
  const active = controller
  isSigningIn.value = true
  try {
    const token = await getAdminApi().login({ username: name, password: password.value }, active.signal)
    if (active.signal.aborted) return
    adminSession.signIn(name, token)
    password.value = ''
    await router.replace({ name: 'admin' })
  } catch (cause) {
    if (active.signal.aborted) return
    error.value = cause instanceof Error ? cause.message : 'Sign-in could not be completed. Please try again.'
    if (cause instanceof ApiError && cause.status === 429) {
      now.value = Date.now()
      retryAt.value = now.value + (cause.retryAfter ?? 60) * 1000
      if (timer) clearInterval(timer)
      timer = setInterval(() => {
        now.value = Date.now()
        if (now.value >= retryAt.value && timer) { clearInterval(timer); timer = undefined }
      }, 250)
    }
  } finally {
    if (!active.signal.aborted) isSigningIn.value = false
  }
}

onBeforeUnmount(() => {
  controller?.abort()
  if (timer) clearInterval(timer)
  password.value = ''
})
</script>

<template>
  <main id="main-content" class="admin-page admin-login-page" tabindex="-1">
    <section class="admin-login-intro" aria-labelledby="admin-login-heading">
      <p class="eyebrow">A LITTLE CARE. A BETTER QUIZ.</p>
      <h1 id="admin-login-heading">A space to<br /><em>keep it curious.</em></h1>
      <p>Good questions make great discoveries. Sign in to grow the collection, refine an answer, or make room for something new.</p>
      <div class="admin-intro-note"><AppIcon name="lock" /><span>A dedicated workspace for the quiz administrator.</span></div>
      <RouterLink to="/" class="admin-back-link">Back to the quiz <AppIcon name="arrow" /></RouterLink>
    </section>

    <section class="box admin-surface admin-login-card" aria-labelledby="sign-in-heading">
      <span class="state-icon"><AppIcon name="lock" /></span>
      <p class="eyebrow">ADMINISTRATION</p>
      <h2 id="sign-in-heading" class="panel-title">Welcome back.</h2>
      <p class="admin-description">Sign in to manage the question bank.</p>
      <p v-if="notice" class="notification admin-notice" role="status">{{ notice }}</p>
      <form class="admin-login-form" @submit.prevent="signIn">
        <fieldset :disabled="isSigningIn">
          <div class="field">
            <label class="label" for="admin-username">Username</label>
            <div class="control"><input id="admin-username" v-model="username" class="input" name="username" autocomplete="username" maxlength="100" required autofocus /></div>
          </div>
          <div class="field">
            <label class="label" for="admin-password">Password</label>
            <div class="control"><input id="admin-password" v-model="password" class="input" name="password" type="password" autocomplete="current-password" maxlength="1024" required /></div>
          </div>
        </fieldset>
        <p v-if="error" class="notification admin-error" role="alert">{{ error }}</p>
        <button class="button admin-primary is-fullwidth" :class="{ 'is-loading': isSigningIn }" type="submit" :disabled="isSigningIn || retrySeconds > 0">
          {{ retrySeconds ? `Try again in ${retrySeconds}s` : 'Sign in' }} <AppIcon name="arrow" />
        </button>
        <p v-if="isSigningIn" class="admin-helper" role="status">Signing in. Please wait for the service to respond.</p>
      </form>
      <p class="admin-session-note">Your sign-in stays in this browser tab until it expires or you sign out. Your password is never saved by this website.</p>
    </section>
  </main>
</template>
