<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from 'vue'
import type { PublicQuestion } from '../../shared/generated/typescript/schema'
import AppIcon from './AppIcon.vue'
import { haveOptionsChanged, validateQuestionForm, type QuestionSubmission } from '../admin/questionForm.ts'

const props = defineProps<{ question: PublicQuestion | null; saving: boolean; error: string }>()
const emit = defineEmits<{
  (event: 'save', submission: QuestionSubmission): void
  (event: 'close'): void
}>()
const editorId = useId()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const text = ref(props.question?.text ?? '')
const optionRows = ref((props.question?.options ?? ['', '']).map((value, id) => ({ id, value })))
const correctAnswerIndex = ref<number | null>(null)
const submitted = ref(false)
const textTouched = ref(false)
const touchedOptions = ref(new Set<number>())
let nextOptionId = optionRows.value.length
let previousFocus: HTMLElement | null = null

const editing = computed(() => props.question !== null)
const optionsChanged = computed(() => props.question !== null
  && haveOptionsChanged(optionRows.value.map((row) => row.value), props.question))
const validation = computed(() => validateQuestionForm({
  text: text.value,
  options: optionRows.value.map((row) => row.value),
  correctAnswerIndex: correctAnswerIndex.value,
}, props.question))
const errors = computed(() => validation.value.fieldErrors)
const showAnswerError = computed(() => submitted.value || optionsChanged.value)

function requestClose() {
  if (!props.saving) emit('close')
}

function closeOnBackdrop(event: MouseEvent) {
  const element = dialog.value
  if (!element || event.target !== element) return
  const bounds = element.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose()
}

async function addOption() {
  if (props.saving || optionRows.value.length >= 10) return
  const id = nextOptionId++
  optionRows.value.push({ id, value: '' })
  await nextTick()
  document.getElementById(`${editorId}-option-${id}`)?.focus()
}

async function removeOption(index: number) {
  if (props.saving || optionRows.value.length <= 2) return
  optionRows.value.splice(index, 1)
  if (correctAnswerIndex.value === index) correctAnswerIndex.value = null
  else if (correctAnswerIndex.value !== null && correctAnswerIndex.value > index) correctAnswerIndex.value--
  await nextTick()
  const nextRow = optionRows.value[Math.min(index, optionRows.value.length - 1)]
  if (nextRow) document.getElementById(`${editorId}-option-${nextRow.id}`)?.focus()
}

async function save() {
  if (props.saving) return
  submitted.value = true
  const submission = validation.value.submission
  if (submission) {
    emit('save', submission)
    return
  }
  await nextTick()
  if (dialog.value) dialog.value.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}

onMounted(() => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.value?.showModal()
})

onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close()
  if (previousFocus?.isConnected) previousFocus.focus()
})
</script>

<template>
  <dialog
    ref="dialog"
    class="box question-editor"
    :aria-labelledby="`${editorId}-heading`"
    :aria-describedby="`${editorId}-description`"
    :aria-busy="saving"
    @cancel.prevent="requestClose"
    @click="closeOnBackdrop"
  >
    <button class="delete editor-close" type="button" aria-label="Close question editor" :disabled="saving" @click="requestClose"></button>
    <p class="eyebrow">QUESTION BANK · {{ editing ? 'EDIT QUESTION' : 'NEW QUESTION' }}</p>
    <h2 :id="`${editorId}-heading`" class="panel-title">{{ editing ? 'Edit question' : 'Create a question' }}</h2>
    <p :id="`${editorId}-description`" class="editor-description">Write your question, add its answer options, and choose the correct answer.</p>

    <form novalidate @submit.prevent="save">
      <fieldset class="editor-fields" :disabled="saving">
        <div class="field">
          <label class="label" :for="`${editorId}-text`">Question</label>
          <textarea
            :id="`${editorId}-text`"
            v-model="text"
            class="textarea"
            rows="3"
            maxlength="500"
            required
            autofocus
            placeholder="Which currency is used in Japan?"
            :aria-invalid="Boolean((submitted || textTouched) && errors.text)"
            :aria-describedby="`${editorId}-text-help${(submitted || textTouched) && errors.text ? ` ${editorId}-text-error` : ''}`"
            @blur="textTouched = true"
          ></textarea>
          <p :id="`${editorId}-text-help`" class="editor-helper">{{ text.trim().length }} / 500</p>
          <p v-if="(submitted || textTouched) && errors.text" :id="`${editorId}-text-error`" class="editor-field-error">{{ errors.text }}</p>
        </div>

        <fieldset class="editor-options" :aria-describedby="`${editorId}-options-help`">
          <legend class="label">Answer options <span>2–10 options</span></legend>
          <p :id="`${editorId}-options-help`" class="editor-helper">Give each option a different name. Choose one correct answer using its radio button.</p>
          <div v-if="editing" class="editor-answer-note">
            <AppIcon name="info" />
            <p>The question list hides correct answers to protect the quiz. Keep the stored answer while the options stay unchanged, or choose an answer below to replace it.</p>
          </div>
          <label v-if="editing && !optionsChanged" class="editor-keep-answer">
            <input :name="`${editorId}-correct-answer`" type="radio" :checked="correctAnswerIndex === null" @change="correctAnswerIndex = null" />
            <span>Keep the stored correct answer</span>
          </label>

          <div class="editor-option-list">
            <div v-for="(option, index) in optionRows" :key="option.id" class="editor-option-row" :class="{ 'is-correct': correctAnswerIndex === index }">
              <div class="editor-option-input">
                <label :for="`${editorId}-option-${option.id}`">Option {{ index + 1 }}</label>
                <input
                  :id="`${editorId}-option-${option.id}`"
                  v-model="option.value"
                  class="input"
                  type="text"
                  maxlength="200"
                  required
                  :placeholder="index === 0 ? 'Japanese yen' : index === 1 ? 'Euro' : 'Another answer option'"
                  :aria-invalid="Boolean((submitted || touchedOptions.has(option.id)) && errors.optionErrors[index])"
                  :aria-describedby="(submitted || touchedOptions.has(option.id)) && errors.optionErrors[index] ? `${editorId}-option-error-${option.id}` : undefined"
                  @blur="touchedOptions.add(option.id)"
                />
              </div>
              <label class="editor-correct-choice">
                <input
                  :name="`${editorId}-correct-answer`"
                  type="radio"
                  :checked="correctAnswerIndex === index"
                  :aria-label="`Mark option ${index + 1} as the correct answer`"
                  :aria-invalid="Boolean(showAnswerError && errors.correctAnswer)"
                  :aria-describedby="showAnswerError && errors.correctAnswer ? `${editorId}-answer-error` : undefined"
                  @change="correctAnswerIndex = index"
                />
                <span>Correct</span>
              </label>
              <button class="button is-ghost editor-remove" type="button" :disabled="optionRows.length <= 2" :aria-label="`Remove option ${index + 1}`" @click="removeOption(index)">
                <AppIcon name="trash" />
              </button>
              <p v-if="(submitted || touchedOptions.has(option.id)) && errors.optionErrors[index]" :id="`${editorId}-option-error-${option.id}`" class="editor-field-error" v-text="errors.optionErrors[index]"></p>
            </div>
          </div>

          <button class="button is-light editor-add" type="button" :disabled="optionRows.length >= 10" @click="addOption"><AppIcon name="plus" />Add option</button>
          <p v-if="submitted && errors.options" class="editor-field-error">{{ errors.options }}</p>
          <p v-if="showAnswerError && errors.correctAnswer" :id="`${editorId}-answer-error`" class="editor-field-error" v-text="errors.correctAnswer"></p>
          <p class="editor-helper">Options can contain up to 200 characters each. Extra spaces at the beginning and end are removed when saving.</p>
        </fieldset>

        <p v-if="errors.form" class="editor-save-note" role="status">{{ errors.form }}</p>
        <p v-if="submitted && !validation.submission && !errors.form" class="editor-field-error" role="alert">Check the highlighted fields before saving.</p>
        <div v-if="error" class="notification editor-request-error" role="alert">{{ error }}</div>
        <div class="editor-actions">
          <button class="button is-light" type="button" @click="requestClose">Cancel</button>
          <button class="button is-primary" type="submit" :class="{ 'is-loading': saving }" :disabled="Boolean(errors.form)">
            <AppIcon name="check" />{{ saving ? 'Saving…' : editing ? 'Save changes' : 'Create question' }}
          </button>
        </div>
      </fieldset>
    </form>
  </dialog>
</template>

<style scoped>
.question-editor.box { position: fixed; width: min(680px, 100vw - 32px); max-height: calc(100dvh - 32px); margin: auto; padding: 32px; overflow-y: auto; border: 1px solid light-dark(#d4ddc9, #3b4b40); border-radius: 15px; background: light-dark(#fffefa, #19251f); color: var(--ink); box-shadow: 0 20px 80px light-dark(#122b2826, #00000059); }
.question-editor:not([open]) { display: none; }
.question-editor::backdrop { background: light-dark(#142f2a66, #060b08bf); backdrop-filter: blur(4px); color-scheme: light dark; }
.editor-close { position: absolute; top: 20px; right: 20px; }
.question-editor > .eyebrow { padding-right: 24px; margin-bottom: 10px; }
.question-editor > .panel-title { margin-bottom: 10px; }
.editor-description { max-width: 520px; margin-bottom: 25px; color: var(--muted); font-size: 13px; line-height: 1.8; }
.editor-fields, .editor-options { min-width: 0; padding: 0; border: 0; }
.question-editor .label { margin-bottom: 9px; color: var(--ink); font-size: 13px; font-weight: 600; }
.question-editor .input, .question-editor .textarea { border-color: light-dark(#d9e1d0, #60745b); background: light-dark(#fffefa, #152019); color: var(--ink); box-shadow: none; font-size: 14px; }
.question-editor .input::placeholder, .question-editor .textarea::placeholder { color: light-dark(#7b886f, #a0af9a); opacity: 1; }
.question-editor .input:focus, .question-editor .textarea:focus { border-color: var(--green); }
.question-editor [aria-invalid="true"] { border-color: light-dark(#aa6745, #d79773); }
.editor-helper { margin-top: 8px; color: var(--muted); font-size: 11px; line-height: 1.8; }
.editor-options { margin-top: 24px; }
.editor-options legend { width: 100%; }
.editor-options legend > span { float: right; color: var(--muted); font-size: 11px; font-weight: 400; }
.editor-options > .editor-helper:first-of-type { margin: 0 0 14px; }
.editor-answer-note { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 15px; padding: 12px; border-radius: 8px; background: light-dark(#f0f4e9, #22332a); color: light-dark(#56684c, #bbceb0); font-size: 11px; line-height: 1.8; }
.editor-answer-note .app-icon { width: 17px; height: 17px; margin-top: 2px; }
.editor-keep-answer { display: flex; align-items: center; gap: 9px; min-height: 44px; margin-bottom: 10px; color: light-dark(#435c35, #c6dbb7); font-size: 12px; cursor: pointer; }
.editor-option-list { display: grid; gap: 11px; }
.editor-option-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 44px; align-items: center; gap: 9px 12px; padding: 13px; border: 1px solid light-dark(#dfe5d6, #3b4b40); border-radius: 9px; }
.editor-option-row.is-correct { border-color: light-dark(#7b9565, #8da976); background: light-dark(#f5f8ef, #293b29); }
.editor-option-input { min-width: 0; }
.editor-option-input > label { display: block; margin-bottom: 7px; color: light-dark(#65765b, #b6c7ab); font-size: 11px; font-weight: 600; }
.editor-correct-choice { display: flex; align-items: center; gap: 7px; min-height: 44px; margin-top: 19px; color: light-dark(#53694a, #bfd3b3); font-size: 12px; cursor: pointer; }
.editor-correct-choice input, .editor-keep-answer input { flex: none; width: 16px; height: 16px; accent-color: var(--green); }
.editor-remove { width: 44px; height: 44px; margin-top: 19px; padding: 0; }
.editor-remove .app-icon { width: 17px; height: 17px; }
.editor-option-row > .editor-field-error { grid-column: 1 / -1; margin: 0; }
.editor-field-error { margin-top: 9px; color: light-dark(#9b5c37, #f0b697); font-size: 11px; line-height: 1.7; }
.editor-add { min-height: 44px; margin-top: 13px; font-size: 12px; }
.editor-add .app-icon { width: 16px; height: 16px; }
.editor-save-note { margin-top: 24px; color: var(--muted); font-size: 12px; line-height: 1.8; }
.editor-request-error { margin-block: 22px 0; padding: 14px; border-radius: 8px; background: light-dark(#fcf2e8, #3b2921); color: light-dark(#955a37, #f0b697); font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
.editor-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 12px; margin-top: 25px; padding-top: 22px; border-top: 1px solid var(--line); }
.editor-actions .button { min-height: 46px; height: auto; font-size: 13px; }
.editor-actions .button.is-primary { border-color: var(--action-bg); background: var(--action-bg); color: var(--action-ink); }
.editor-actions .button.is-primary:hover { background: var(--action-hover-bg); color: var(--action-ink); }
.editor-actions .app-icon { width: 17px; height: 17px; }
.editor-fields:disabled .editor-correct-choice, .editor-fields:disabled .editor-keep-answer { cursor: default; }
@media (max-width: 480px) {
  .question-editor.box { width: calc(100vw - 24px); max-height: calc(100dvh - 24px); padding: 26px 18px 22px; }
  .editor-option-row { grid-template-columns: minmax(0, 1fr) 44px; gap: 5px 8px; padding: 11px; }
  .editor-option-input { grid-column: 1 / -1; }
  .editor-correct-choice, .editor-remove { margin-top: 0; }
  .editor-actions .button { flex: 1; justify-content: center; padding-inline: 10px; }
}
</style>
