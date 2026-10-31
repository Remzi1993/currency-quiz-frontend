<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import {
  endpoints, exampleQuestionId, buildEndpointUrl,
  buildJavaScriptExample, buildShellExamples,
} from '../docs/apiReference.ts'
import { projectLinks } from '../projectLinks.ts'

const route = useRoute()
const sectionHeading = ref<HTMLElement | null>(null)
const baseUrlInput = ref(import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') || window.location.origin)
const questionId = ref(exampleQuestionId)
const answer = ref('Japanese yen')
const language = ref('javascript')
const copyMessage = ref('')
const isSending = ref(false)
const requestError = ref('')
const liveResponse = ref<{ status: number; statusText: string; body: string; duration: number } | null>(null)
let controller: AbortController | undefined
let requestNumber = 0

const section = computed(() => typeof route.params.section === 'string' ? route.params.section : '')
const selectedEndpoint = computed(() => endpoints.find(({ id }) => id === section.value))
const isOverview = computed(() => section.value === '')
const exampleEndpoint = computed(() => selectedEndpoint.value ?? endpoints[0]!)
const groups = ['Public quiz', 'Administration'] as const
const baseUrl = computed(() => {
  try {
    const url = new URL(baseUrlInput.value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null
    return url.href.replace(/\/+$/, '')
  } catch { return null }
})
const requestUrl = computed(() => buildEndpointUrl(baseUrl.value ?? 'https://your-backend.example', exampleEndpoint.value, questionId.value))
const shellExamples = computed(() => buildShellExamples(baseUrl.value ?? 'https://your-backend.example', exampleEndpoint.value, questionId.value))
const codeTabs = computed(() => [
  { id: 'javascript', label: 'JavaScript' },
  ...(shellExamples.value.shared ? [{ id: 'terminal', label: 'Terminal' }] : [
    { id: 'powershell', label: 'PowerShell' },
    { id: 'bash', label: 'Bash' },
  ]),
])
const exampleCode = computed(() => {
  if (language.value === 'terminal') return shellExamples.value.shared ?? ''
  if (language.value === 'powershell') return shellExamples.value.powershell ?? ''
  if (language.value === 'bash') return shellExamples.value.bash ?? ''
  return buildJavaScriptExample(baseUrl.value ?? 'https://your-backend.example', exampleEndpoint.value, questionId.value)
})
const sampleResponse = computed(() => exampleEndpoint.value.successStatus === 204
  ? 'No response body.'
  : JSON.stringify(exampleEndpoint.value.responseBody, null, 2))
const canTryEndpoint = computed(() => ['list-questions', 'get-question', 'check-answer'].includes(exampleEndpoint.value.id))
const needsQuestionId = computed(() => exampleEndpoint.value.path.includes('{id}'))
const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

function clearRequest() {
  requestNumber++
  controller?.abort()
  controller = undefined
  isSending.value = false
  liveResponse.value = null
  requestError.value = ''
}

watch(section, async () => {
  clearRequest()
  language.value = 'javascript'
  copyMessage.value = ''
  await nextTick()
  sectionHeading.value?.focus()
})
watch([baseUrlInput, questionId, answer], clearRequest)
watch(codeTabs, (tabs) => {
  if (!tabs.some(({ id }) => id === language.value)) language.value = 'javascript'
})

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    copyMessage.value = `${label} copied.`
  } catch {
    copyMessage.value = 'Copy is unavailable in this browser. You can select the example text to copy it.'
  }
}

async function sendRequest() {
  if (isSending.value || !canTryEndpoint.value) return
  if (!baseUrl.value) {
    requestError.value = 'Enter an HTTP or HTTPS base URL without credentials, query parameters, or a fragment.'
    return
  }
  if (needsQuestionId.value && !uuidPattern.test(questionId.value)) {
    requestError.value = 'Enter a question UUID from a real list-questions response.'
    return
  }
  if (exampleEndpoint.value.id === 'check-answer' && (!answer.value.trim() || answer.value.trim().length > 200)) {
    requestError.value = 'Enter an answer containing 1 to 200 characters after trimming.'
    return
  }

  clearRequest()
  const currentRequest = requestNumber
  controller = new AbortController()
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)])
  const started = performance.now()
  isSending.value = true
  try {
    const response = await fetch(requestUrl.value, {
      method: exampleEndpoint.value.method,
      headers: exampleEndpoint.value.id === 'check-answer'
        ? { Accept: 'application/json', 'Content-Type': 'application/json' }
        : { Accept: 'application/json' },
      ...(exampleEndpoint.value.id === 'check-answer' ? { body: JSON.stringify({ answer: answer.value }) } : {}),
      signal,
      credentials: 'omit',
    })
    const text = await response.text()
    if (currentRequest !== requestNumber) return
    let body = text || 'No response body.'
    try { body = JSON.stringify(JSON.parse(text), null, 2) } catch { /* A host may return HTML or plain text. */ }
    liveResponse.value = { status: response.status, statusText: response.statusText, body, duration: Math.round(performance.now() - started) }
    if (response.status === 503) {
      requestError.value = 'This experimental school project uses Render’s Free plan. The backend may be waking up after inactivity, which can take up to one minute. Try the request again shortly.'
    } else if (!response.ok) {
      requestError.value = `The service returned HTTP ${response.status}. Check the response below for details.`
    }
  } catch (cause) {
    if (currentRequest !== requestNumber) return
    requestError.value = cause instanceof DOMException && (cause.name === 'TimeoutError' || cause.name === 'AbortError')
      ? 'The request took longer than one minute. Please try again.'
      : 'The request could not reach the API. Check the base URL, your connection, and the backend’s CORS settings.'
  } finally {
    if (currentRequest === requestNumber) {
      isSending.value = false
      controller = undefined
    }
  }
}

onBeforeUnmount(clearRequest)
</script>

<template>
  <main id="main-content" class="docs-page" tabindex="-1">
    <header class="docs-header">
      <div>
        <p class="eyebrow">BUILD SOMETHING CURIOUS</p>
        <h1>Currency Quiz <em>API.</em></h1>
        <p>A small REST API for questions, answers, and a little everyday discovery.</p>
      </div>
      <div class="docs-contract-links">
        <span class="tag">API v1 · JSON</span>
        <a class="button is-light" :href="projectLinks.openApiSpec" target="_blank" rel="noopener">View OpenAPI <AppIcon name="arrow" /></a>
        <a :href="projectLinks.contract" target="_blank" rel="noopener">API contract on GitHub</a>
      </div>
    </header>

    <div class="docs-layout">
      <aside class="docs-sidebar">
        <nav class="menu" aria-label="API reference">
          <p class="menu-label">Start here</p>
          <ul class="menu-list"><li><RouterLink to="/documentation" :class="{ 'is-active': isOverview }" :aria-current="isOverview ? 'page' : undefined" exact-active-class="">Getting started</RouterLink></li></ul>
          <template v-for="group in groups" :key="group">
            <p class="menu-label">{{ group }}</p>
            <ul class="menu-list">
              <li v-for="endpoint in endpoints.filter((item) => item.group === group)" :key="endpoint.id">
                <RouterLink :to="`/documentation/${endpoint.id}`" :class="{ 'is-active': section === endpoint.id }"><span class="method-dot" :class="`method-${endpoint.method.toLowerCase()}`">{{ endpoint.method }}</span>{{ endpoint.label }}</RouterLink>
              </li>
            </ul>
          </template>
          <p class="menu-label">The source of truth</p>
          <a class="docs-source-link" :href="projectLinks.contract" target="_blank" rel="noopener">currency-quiz-shared<br />API contract on GitHub <AppIcon name="arrow" /></a>
        </nav>
        <div class="docs-sidebar-note"><AppIcon name="spark" /><p>Currency quiz API.<br /><strong>No account or API key needed.</strong></p></div>
      </aside>

      <article class="docs-content">
        <section class="docs-base-url" aria-labelledby="base-url-heading">
          <label id="base-url-heading" for="api-base-url">API base URL</label>
          <input id="api-base-url" v-model.trim="baseUrlInput" class="input" type="url" spellcheck="false" autocomplete="off" placeholder="https://your-backend.onrender.com" aria-describedby="base-url-help" />
          <p id="base-url-help">Examples and live requests use this address. It defaults to the API configured for this website.</p>
          <p v-if="!baseUrl" class="has-text-danger" role="status">Enter a valid HTTP(S) URL without credentials, query parameters, or a fragment.</p>
        </section>

        <template v-if="isOverview || selectedEndpoint">
          <section v-if="isOverview" class="docs-introduction">
            <p class="eyebrow">GETTING STARTED</p>
            <h2 ref="sectionHeading" tabindex="-1">Your first quiz, in two requests.</h2>
            <p>Fetch the questions, show their options, and send an answer back to the API. The server checks correctness; public responses never include the correct answer.</p>
            <ol class="docs-steps">
              <li><span>01</span><div><strong>Get your questions</strong><p><RouterLink to="/documentation/list-questions">List all questions</RouterLink> and pick a question’s real <code>id</code>.</p></div></li>
              <li><span>02</span><div><strong>Check an answer</strong><p>Send <code>{ "answer": "Japanese yen" }</code> to <RouterLink to="/documentation/check-answer">the answer endpoint</RouterLink>. You’ll receive <code>{ "correct": true }</code> or <code>{ "correct": false }</code>.</p></div></li>
            </ol>
            <div class="notification docs-info"><AppIcon name="info" /><p>No pagination or random-question endpoint is defined. The list returns the available question bank; your application chooses the round length and question order.</p></div>
            <h3 class="docs-subheading">Start with a list of questions</h3>
          </section>
          <section v-else class="docs-endpoint-intro">
            <p class="eyebrow">{{ exampleEndpoint.group }}</p>
            <h2 ref="sectionHeading" tabindex="-1">{{ exampleEndpoint.title }}</h2>
            <p>{{ exampleEndpoint.description }}</p>
          </section>

          <div class="docs-endpoint-address"><span class="method-badge" :class="`method-${exampleEndpoint.method.toLowerCase()}`">{{ exampleEndpoint.method }}</span><code>{{ requestUrl }}</code><button class="button is-small is-ghost" type="button" aria-label="Copy endpoint URL" @click="copy(requestUrl, 'Endpoint URL')">Copy</button></div>
          <div class="docs-access-note"><AppIcon :name="exampleEndpoint.auth ? 'flag' : 'check'" /><span>{{ exampleEndpoint.auth ? 'Requires an admin Bearer token.' : exampleEndpoint.id === 'login' ? 'Requires the backend administrator’s credentials.' : 'Public endpoint — no authentication required.' }}</span></div>

          <section v-if="needsQuestionId" class="docs-section">
            <h3>Path parameter</h3>
            <label class="label docs-field-label" for="question-id">Question ID <span>Required · UUID</span></label>
            <input id="question-id" v-model.trim="questionId" class="input docs-mono-input" spellcheck="false" autocomplete="off" aria-describedby="question-id-help" />
            <p id="question-id-help" class="docs-helper">Replace the example UUID with an <code>id</code> returned by <RouterLink to="/documentation/list-questions">List all questions</RouterLink>. The sample ID is illustrative.</p>
          </section>

          <section v-if="exampleEndpoint.requestBody" class="docs-section">
            <div class="docs-section-heading"><h3>Request body</h3><span>application/json</span></div>
            <pre class="docs-code docs-light-code"><code>{{ JSON.stringify(exampleEndpoint.requestBody, null, 2) }}</code></pre>
          </section>

          <section class="docs-section">
            <div class="docs-section-heading"><h3>Request example</h3><button class="button is-small is-ghost" type="button" @click="copy(exampleCode, 'Request example')">Copy code</button></div>
            <div class="docs-code-panel">
              <div class="docs-code-tabs" role="group" aria-label="Request example language">
                <button v-for="tab in codeTabs" :key="tab.id" type="button" :class="{ 'is-active': language === tab.id }" :aria-pressed="language === tab.id" @click="language = tab.id">{{ tab.label }}</button>
              </div>
              <p v-if="language === 'terminal'" class="docs-code-caption">Works in PowerShell 7+ and Linux/Bash.</p>
              <p v-else-if="language === 'powershell'" class="docs-code-caption">PowerShell 7+ · Invoke-RestMethod</p>
              <p v-else-if="language === 'javascript' && exampleEndpoint.auth" class="docs-code-caption">Node.js · Set ADMIN_TOKEN in your environment to the token returned by admin login.</p>
              <pre class="docs-code"><code>{{ exampleCode }}</code></pre>
            </div>
            <p class="docs-copy-status" role="status" aria-live="polite">{{ copyMessage }}</p>
          </section>

          <section class="docs-section">
            <div class="docs-section-heading"><h3>Example response</h3><span class="docs-success-status">{{ exampleEndpoint.successStatus }} {{ exampleEndpoint.successStatus === 201 ? 'Created' : exampleEndpoint.successStatus === 204 ? 'No Content' : 'OK' }}</span></div>
            <pre class="docs-code docs-light-code"><code>{{ sampleResponse }}</code></pre>
            <p class="docs-helper">Sample data to illustrate the contract. Use the live explorer for a response from your API.</p>
          </section>

          <section v-if="exampleEndpoint.notes.length" class="docs-section">
            <h3>Good to know</h3>
            <ul class="docs-notes"><li v-for="note in exampleEndpoint.notes" :key="note">{{ note }}</li></ul>
          </section>

          <section v-if="canTryEndpoint" class="docs-section docs-explorer" aria-labelledby="explorer-heading">
            <p class="eyebrow">LIVE EXPLORER</p>
            <h3 id="explorer-heading">Try this request</h3>
            <p>Send a request to the API base URL above. {{ exampleEndpoint.id === 'check-answer' ? 'Answer checks count towards the 30-per-minute limit.' : 'This reads public question data.' }}</p>
            <form @submit.prevent="sendRequest">
              <div v-if="exampleEndpoint.id === 'check-answer'" class="field">
                <label class="label docs-field-label" for="live-answer">Your answer</label>
                <input id="live-answer" v-model="answer" class="input" maxlength="200" required placeholder="Japanese yen" />
              </div>
              <button class="button is-primary" :class="{ 'is-loading': isSending }" type="submit" :disabled="isSending || !baseUrl">Send {{ exampleEndpoint.method }} request <AppIcon name="arrow" /></button>
            </form>
            <p v-if="isSending" class="docs-helper" role="status">Waiting for the API. The request has a one-minute timeout.</p>
            <p v-if="requestError" class="docs-request-error" role="alert">{{ requestError }}</p>
            <template v-if="liveResponse">
              <div class="docs-live-status"><strong :class="liveResponse.status >= 400 ? 'has-text-danger' : 'has-text-success'">{{ liveResponse.status }} {{ liveResponse.statusText }}</strong><span>{{ liveResponse.duration }} ms · Live response</span></div>
              <pre class="docs-code docs-light-code docs-live-body"><code>{{ liveResponse.body }}</code></pre>
            </template>
          </section>
          <div v-else class="notification docs-info"><AppIcon name="info" /><p>Administration examples are for the API owner or an authorised administrator. Replace the credential or token placeholders in your own environment. This page does not send admin requests or store credentials.</p></div>

          <section class="docs-section">
            <h3>Response codes</h3>
            <div class="table-container"><table class="table is-fullwidth docs-response-table"><thead><tr><th scope="col">Status</th><th scope="col">Meaning</th></tr></thead><tbody><tr v-for="response in exampleEndpoint.responses" :key="response.status"><td><code>{{ response.status }}</code></td><td>{{ response.description }}</td></tr></tbody></table></div>
          </section>

          <section class="docs-section docs-errors">
            <h3>Errors, limits, and hosting</h3>
            <p>API errors use this JSON shape. Validation errors can include more information in <code>details</code>.</p>
            <pre class="docs-code docs-light-code"><code>{{ JSON.stringify({ code: 'validation_error', message: 'Request validation failed', details: ['An answer is required.'] }, null, 2) }}</code></pre>
            <p><strong>429 Too Many Requests:</strong> respect the <code>Retry-After</code> header (seconds). Answer checks allow 30 submissions per minute per client IP; login allows 5 attempts per minute per client IP.</p>
            <p><strong>503 Service Unavailable:</strong> this experimental school project uses Render’s Free plan. The backend may need up to a minute to wake after inactivity. Hosting responses may be HTML; only an actual HTTP 503 is treated as possible startup. Other failures need to be handled as errors.</p>
            <p><strong>Browser access:</strong> the backend must allow your application’s origin through CORS. Use HTTPS outside local development.</p>
            <p>The <a :href="projectLinks.contract" target="_blank" rel="noopener">API contract repository</a> contains the <a :href="projectLinks.openApiSpec" target="_blank" rel="noopener">OpenAPI specification</a> defining all request fields, validation rules, and responses.</p>
          </section>
        </template>
        <section v-else class="box docs-not-found">
          <h2 ref="sectionHeading" tabindex="-1">This endpoint isn’t in the reference.</h2>
          <p>Pick an endpoint from the menu or head back to <RouterLink to="/documentation">Getting started</RouterLink>.</p>
        </section>
      </article>
    </div>
  </main>
</template>
