<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import QuestionEditor from '../components/QuestionEditor.vue'
import { ApiError } from '../api/client.ts'
import { getAdminApi, type PublicQuestion, type AdminQuestion } from '../api/adminClient.ts'
import { adminSession } from '../composables/adminSession.ts'
import { markQuestionBankChanged } from '../composables/questionBankRevision.ts'
import type { QuestionSubmission } from '../admin/questionForm.ts'
import '../admin/admin.css'

const api = getAdminApi()
const router = useRouter()
const questions = shallowRef<PublicQuestion[]>([])
const search = ref('')
const isLoading = ref(false)
const loadError = ref('')
const notice = ref('')
const editorOpen = ref(false)
const editingQuestion = shallowRef<PublicQuestion | null>(null)
const isSaving = ref(false)
const saveError = ref('')
const deleteDialog = useTemplateRef<HTMLDialogElement>('deleteDialog')
const deletingQuestion = shallowRef<PublicQuestion | null>(null)
const isDeleting = ref(false)
const deleteError = ref('')
const hasLoaded = ref(false)
const isSigningOut = ref(false)
const signOutError = ref('')
let loadController: AbortController | undefined
let writeController: AbortController | undefined
let loadNumber = 0
let previousDeleteFocus: HTMLElement | null = null

const filteredQuestions = computed(() => {
  const query = search.value.trim().toLowerCase()
  return query ? questions.value.filter((question) =>
    [question.text, question.id, ...question.options].some((value) => value.toLowerCase().includes(query)),
  ) : questions.value
})

watch(adminSession.state, (session) => {
  if (!session) {
    cancelLoading()
    writeController?.abort()
    void router.replace({ name: 'admin-login', query: { reason: isSigningOut.value ? 'signed-out' : 'expired' } })
  }
}, { immediate: true })

function cancelLoading() {
  loadController?.abort()
  loadController = undefined
  loadNumber++
  isLoading.value = false
}

function handleError(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 401) {
    adminSession.invalidate()
    return 'Your session ended. Please sign in again.'
  }
  return cause instanceof Error ? cause.message : 'The request could not be completed. Please try again.'
}

function writeError(cause: unknown): string {
  const message = handleError(cause)
  return cause instanceof ApiError && cause.status === undefined
    ? `${message} Refresh the question list before retrying, as the change may already have been saved.`
    : message
}

async function loadQuestions() {
  if (!adminSession.getCsrfToken()) return
  loadController?.abort()
  const active = new AbortController()
  loadController = active
  const current = ++loadNumber
  isLoading.value = true
  loadError.value = ''
  try {
    await adminSession.restore(true, active.signal)
    if (current !== loadNumber || active.signal.aborted || !adminSession.getCsrfToken()) return
    if (!await adminSession.ensureAccess(active.signal)) return
    const result = await api.listQuestions(active.signal)
    if (current !== loadNumber || active.signal.aborted) return
    questions.value = result
    hasLoaded.value = true
  } catch (cause) {
    if (!active.signal.aborted && current === loadNumber) loadError.value = handleError(cause)
  } finally {
    if (!active.signal.aborted && current === loadNumber) isLoading.value = false
  }
}

function openEditor(question: PublicQuestion | null) {
  editingQuestion.value = question
  saveError.value = ''
  notice.value = ''
  editorOpen.value = true
}

function closeEditor() {
  if (isSaving.value) return
  editorOpen.value = false
  editingQuestion.value = null
  saveError.value = ''
}

function publicView(question: AdminQuestion): PublicQuestion {
  return { id: question.id, text: question.text, options: [...question.options] }
}

async function saveQuestion(submission: QuestionSubmission) {
  if (isSaving.value) return
  if (!adminSession.getCsrfToken()) return
  cancelLoading()
  const active = new AbortController()
  writeController = active
  isSaving.value = true
  saveError.value = ''
  try {
    const csrfToken = await adminSession.ensureAccess(active.signal)
    if (!csrfToken || active.signal.aborted) return
    const result = submission.mode === 'create'
      ? await api.createQuestion(csrfToken, submission.body, active.signal)
      : await api.updateQuestion(csrfToken, submission.id, submission.body, active.signal)
    if (active.signal.aborted) return
    const updated = publicView(result)
    questions.value = submission.mode === 'create'
      ? [...questions.value, updated]
      : questions.value.map((question) => question.id === updated.id ? updated : question)
    markQuestionBankChanged()
    notice.value = submission.mode === 'create' ? 'Question created. Added to the end of the list.' : 'Question updated.'
    editorOpen.value = false
    editingQuestion.value = null
  } catch (cause) {
    if (!active.signal.aborted) saveError.value = writeError(cause)
  } finally {
    if (!active.signal.aborted) isSaving.value = false
  }
}

async function openDelete(question: PublicQuestion) {
  deletingQuestion.value = question
  deleteError.value = ''
  previousDeleteFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  await nextTick()
  deleteDialog.value?.showModal()
}

function closeDelete() {
  if (isDeleting.value) return
  deleteDialog.value?.close()
  deletingQuestion.value = null
  deleteError.value = ''
  if (previousDeleteFocus?.isConnected) previousDeleteFocus.focus()
}

function closeDeleteOnBackdrop(event: MouseEvent) {
  const dialog = deleteDialog.value
  if (!dialog || event.target !== dialog) return
  const bounds = dialog.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDelete()
}

async function deleteQuestion() {
  if (isDeleting.value || !deletingQuestion.value) return
  if (!adminSession.getCsrfToken()) return
  cancelLoading()
  const question = deletingQuestion.value
  const active = new AbortController()
  writeController = active
  isDeleting.value = true
  deleteError.value = ''
  try {
    const csrfToken = await adminSession.ensureAccess(active.signal)
    if (!csrfToken || active.signal.aborted) return
    await api.deleteQuestion(csrfToken, question.id, active.signal)
    if (active.signal.aborted) return
    questions.value = questions.value.filter(({ id }) => id !== question.id)
    markQuestionBankChanged()
    notice.value = 'Question deleted.'
    isDeleting.value = false
    closeDelete()
  } catch (cause) {
    if (!active.signal.aborted) deleteError.value = writeError(cause)
  } finally {
    if (!active.signal.aborted) isDeleting.value = false
  }
}

async function signOut() {
  if (isSigningOut.value || isSaving.value || isDeleting.value) return
  isSigningOut.value = true
  signOutError.value = ''
  try { await adminSession.signOut() } catch (cause) {
    signOutError.value = `${cause instanceof Error ? cause.message : 'Sign-out could not be completed.'} You are still signed in. Please try signing out again.`
  } finally { isSigningOut.value = false }
}

onMounted(() => {
  void loadQuestions()
})
onBeforeUnmount(() => {
  loadController?.abort()
  writeController?.abort()
  deleteDialog.value?.close()
})
</script>

<template>
  <main id="main-content" class="admin-page" tabindex="-1">
    <header class="admin-topbar">
      <div>
        <p class="eyebrow">ADMINISTRATION · QUESTION BANK</p>
        <h1>Keep the world <em>curious.</em></h1>
        <p class="admin-description">Create, refine, and organise the questions behind the quiz.</p>
      </div>
      <div class="admin-account"><span>Signed in as <strong>{{ adminSession.state.value?.username }}</strong></span><button class="button is-light" type="button" :class="{ 'is-loading': isSigningOut }" :disabled="isSigningOut || isSaving || isDeleting" @click="signOut"><AppIcon name="logout" />Sign out</button></div>
    </header>
    <p v-if="signOutError" class="notification admin-error" role="alert">{{ signOutError }}</p>
    <p v-if="adminSession.restoreError.value" class="notification admin-error" role="status">{{ adminSession.restoreError.value }}</p>
    <p class="admin-helper">Access is renewed when you make changes. Sign in again when renewal expires or the sign-in limit is reached; the default limit is 24 hours.</p>

    <section class="box admin-surface admin-bank" aria-labelledby="question-bank-heading">
      <div class="admin-bank-heading">
        <div><h2 id="question-bank-heading">Your questions <span class="tag">{{ questions.length }}</span></h2><p>Small questions. A world of discovery.</p></div>
        <button class="button admin-primary" type="button" :disabled="isLoading" @click="openEditor(null)"><AppIcon name="plus" />Create question</button>
      </div>
      <div class="admin-toolbar">
        <div class="field admin-search">
          <label class="is-sr-only" for="admin-search">Search questions</label>
          <div class="control has-icons-left"><input id="admin-search" v-model="search" class="input" type="search" placeholder="Search questions, options, or IDs…" /><span class="icon is-left"><AppIcon name="search" /></span></div>
        </div>
        <button class="button is-light" :class="{ 'is-loading': isLoading }" type="button" :disabled="isLoading" @click="loadQuestions"><AppIcon name="refresh" />Refresh</button>
      </div>
      <p v-if="notice" class="notification admin-notice" role="status">{{ notice }}</p>
      <div v-if="loadError" class="notification admin-error" role="alert"><p>{{ loadError }}</p><button class="button is-small is-light" type="button" :disabled="isLoading" @click="loadQuestions">Try again</button></div>
      <p v-if="isLoading" class="admin-loading" role="status">Loading the question bank…</p>
      <p v-else-if="!questions.length && hasLoaded" class="admin-empty">The question bank is empty. Create the first question to get things started.</p>
      <p v-else-if="!filteredQuestions.length && questions.length" class="admin-empty">No questions match your search. Try a different word or clear the search.</p>
      <template v-if="filteredQuestions.length">
        <p class="admin-result-count" role="status">Showing {{ filteredQuestions.length }} of {{ questions.length }} questions</p>
        <table class="table is-fullwidth admin-question-table">
          <caption class="is-sr-only">Quiz question bank with edit and delete actions</caption>
          <thead><tr><th scope="col">Question</th><th scope="col">Options</th><th scope="col" class="admin-actions-heading">Actions</th></tr></thead>
          <tbody>
            <tr v-for="question in filteredQuestions" :key="question.id">
              <td class="admin-question-text"><strong>{{ question.text }}</strong><code>{{ question.id }}</code></td>
              <td class="admin-question-options"><ul><li v-for="option in question.options" :key="option">{{ option }}</li></ul></td>
              <td class="admin-question-actions"><div>
                <button class="button is-light admin-icon-button" type="button" :aria-label="`Edit question: ${question.text}`" title="Edit question" @click="openEditor(question)"><AppIcon name="pencil" /></button>
                <button class="button is-light admin-icon-button admin-delete-button" type="button" :aria-label="`Delete question: ${question.text}`" title="Delete question" @click="openDelete(question)"><AppIcon name="trash" /></button>
              </div></td>
            </tr>
          </tbody>
        </table>
      </template>
    </section>

    <QuestionEditor v-if="editorOpen" :question="editingQuestion" :saving="isSaving" :error="saveError" @save="saveQuestion" @close="closeEditor" />

    <dialog ref="deleteDialog" class="box admin-delete-dialog" aria-labelledby="delete-heading" @cancel.prevent="closeDelete" @click="closeDeleteOnBackdrop">
      <span class="state-icon admin-delete-icon"><AppIcon name="trash" /></span>
      <p class="eyebrow">REMOVE A QUESTION</p>
      <h2 id="delete-heading" class="panel-title">Delete this question?</h2>
      <p class="admin-description">This permanently removes the question from the quiz bank.</p>
      <p class="admin-delete-preview">{{ deletingQuestion?.text }}</p>
      <p v-if="deleteError" class="notification admin-error" role="alert">{{ deleteError }}</p>
      <div class="admin-dialog-actions"><button class="button is-light" type="button" :disabled="isDeleting" autofocus @click="closeDelete">Cancel</button><button class="button is-danger" :class="{ 'is-loading': isDeleting }" type="button" :disabled="isDeleting" @click="deleteQuestion"><AppIcon name="trash" />Delete question</button></div>
    </dialog>
  </main>
</template>
