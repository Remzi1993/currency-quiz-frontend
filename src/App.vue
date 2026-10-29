<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import AppIcon from './components/AppIcon.vue'
import CurrencyGlobe from './components/CurrencyGlobe.vue'
import { useQuiz } from './composables/useQuiz.ts'

const {
  phase, questions, questionCount, currentQuestion, currentNumber, totalQuestions,
  selectedAnswer, answerResult, records, correctCount, progress, error,
  isSubmitting, retryAt, load, start, submit, next, restart,
} = useQuiz()

const helpDialog = ref<HTMLDialogElement | null>(null)
const exitDialog = ref<HTMLDialogElement | null>(null)
const panelHeading = ref<HTMLElement | null>(null)
const feedback = ref<HTMLElement | null>(null)
const now = ref(Date.now())
const retrySeconds = computed(() => Math.max(0, Math.ceil(((retryAt.value ?? 0) - now.value) / 1000)))
const scorePercent = computed(() => totalQuestions.value ? Math.round(correctCount.value / totalQuestions.value * 100) : 0)
const roundLength = computed(() => Math.min(questionCount.value, questions.value.length))
const countChoices = computed(() => [
  ...(questions.value.length > 10 ? [{ value: 10, label: '10', description: 'Quick round' }] : []),
  ...(questions.value.length > 20 ? [{ value: 20, label: '20', description: 'Go a little further' }] : []),
  { value: questions.value.length, label: 'All', description: `${questions.value.length} questions` },
])
const resultTitle = computed(() => scorePercent.value === 100 ? 'A world-class round.' : scorePercent.value >= 70 ? 'You know your money.' : scorePercent.value >= 40 ? 'Your knowledge is growing.' : 'Every journey starts somewhere.')

function leaveQuiz() {
  exitDialog.value?.close()
  restart()
}

watch(questions, (loaded) => {
  if (loaded.length && !countChoices.value.some(({ value }) => value === questionCount.value)) {
    questionCount.value = Math.min(10, loaded.length)
  }
})

watch([phase, currentNumber], async () => {
  await nextTick()
  panelHeading.value?.focus({ preventScroll: phase.value !== 'playing' && phase.value !== 'results' })
})

watch(answerResult, async (result) => {
  if (!result) return
  await nextTick()
  feedback.value?.focus()
})

watch(retryAt, (deadline, _previous, onCleanup) => {
  now.value = Date.now()
  if (deadline === null) return
  const timer = window.setInterval(() => {
    now.value = Date.now()
    if (now.value >= deadline) window.clearInterval(timer)
  }, 250)
  onCleanup(() => window.clearInterval(timer))
})

onMounted(load)
</script>

<template>
  <a href="#main-content" class="skip-link">Skip to quiz</a>
  <div class="app-shell">
    <header class="site-header">
      <div class="brand" aria-label="Currency Quiz">
        <span class="brand-mark"><AppIcon name="globe" /></span>
        <span>currency<span class="brand-light">quiz</span><span class="brand-dot">.</span></span>
      </div>
      <span class="header-note">For the curious minds.</span>
      <button class="button is-ghost help-button" type="button" @click="helpDialog?.showModal()">
        <AppIcon name="info" /> <span>How to play</span>
      </button>
    </header>

    <main id="main-content" class="main-content" :class="{ 'is-in-round': phase === 'playing', 'is-results': phase === 'results' }">
      <section class="intro-panel" aria-labelledby="page-heading">
        <p class="eyebrow"><span class="status-dot"></span> A LITTLE CURIOSITY. A WORLD OF CURRENCIES.</p>
        <template v-if="phase === 'results'">
          <h1 id="page-heading">A little wiser.<br />A little more<br /><em>worldly.</em></h1>
          <p class="intro-description">Every currency has a story. You just got to know a few more of them.</p>
        </template>
        <template v-else-if="phase === 'playing'">
          <h1 id="page-heading">One question.<br />A whole new<br /><em>perspective.</em></h1>
          <p class="intro-description">From everyday change to faraway places. Follow your curiosity, one answer at a time.</p>
          <div class="round-score">
            <div><span class="eyebrow">YOUR ROUND</span><strong>{{ correctCount }} <span>/ {{ records.length }}</span></strong><span class="small-copy">answers correct</span></div>
            <div class="mini-progress" aria-hidden="true"><span v-for="record, index in records" :key="index" :class="record.correct ? 'is-correct' : 'is-incorrect'"></span><span v-if="!records.length" class="is-pending"></span></div>
          </div>
        </template>
        <template v-else>
          <h1 id="page-heading">A world of<br />currencies.<br /><em>How many<br class="mobile-break" /> do you know?</em></h1>
          <p class="intro-description">Put your currency knowledge to the test.<br class="desktop-break" /> A quick trip around the world, no passport needed.</p>
        </template>
        <CurrencyGlobe v-if="phase !== 'playing'" />
        <div v-else class="round-note"><AppIcon name="spark" /><p>Take your time.<br /><strong>Curiosity has no countdown.</strong></p></div>
      </section>

      <section class="quiz-panel" aria-label="Currency quiz">
        <div v-if="phase === 'loading'" class="box quiz-box state-box" aria-live="polite" aria-busy="true">
          <span class="state-icon"><AppIcon name="globe" /></span>
          <h2 class="panel-title">A world of questions awaits.</h2>
          <p class="muted">Getting your quiz ready…</p>
          <progress class="progress is-small is-primary loading-progress" max="100">Loading questions</progress>
        </div>

        <div v-else-if="phase === 'error' || phase === 'empty'" class="box quiz-box state-box">
          <span class="state-icon"><AppIcon :name="phase === 'empty' ? 'flag' : 'globe'" /></span>
          <p class="eyebrow">A SMALL DETOUR</p>
          <h2 ref="panelHeading" class="panel-title" tabindex="-1">{{ phase === 'empty' ? 'No questions just yet.' : 'We couldn’t load the quiz.' }}</h2>
          <p v-if="phase === 'error'" class="muted" role="alert">{{ error }}</p>
          <p v-else class="muted">The question bank is empty. Come back when a few questions have been added.</p>
          <button class="button is-primary primary-action" type="button" @click="load"><AppIcon name="refresh" />Try again</button>
        </div>

        <div v-else-if="phase === 'welcome'" class="box quiz-box welcome-box">
          <div class="panel-topline"><span class="eyebrow">YOUR NEXT LITTLE ADVENTURE</span><span class="tag available-tag"><span class="status-dot"></span>{{ questions.length }} questions available</span></div>
          <span class="welcome-icon"><AppIcon name="globe" /></span>
          <h2 ref="panelHeading" class="panel-title" tabindex="-1">Ready to make some change?</h2>
          <p class="muted panel-description">Pick your round. Trust your knowledge.<br />Discover how much of the world is in your pocket.</p>

          <fieldset class="round-picker">
            <legend class="field-label-text">How many questions?</legend>
            <div class="count-choices">
              <label v-for="choice in countChoices" :key="choice.value" class="count-choice" :class="{ 'is-selected': questionCount === choice.value }">
                <input v-model="questionCount" class="is-sr-only" type="radio" name="question-count" :value="choice.value" />
                <span class="count-number">{{ choice.label }}<AppIcon v-if="questionCount === choice.value" name="check" /></span>
                <span>{{ choice.description }}</span>
              </label>
            </div>
          </fieldset>
          <button class="button is-primary primary-action start-action" type="button" @click="start">Let’s play <AppIcon name="arrow" /></button>
          <p class="button-caption">{{ roundLength }} questions <span>·</span> Your pace <span>·</span> No sign-up</p>
          <div class="welcome-bottom"><AppIcon name="spark" /><p>A new mix of questions every round.<br /><strong>Same world. A fresh perspective.</strong></p></div>
        </div>

        <div v-else-if="phase === 'playing' && currentQuestion" class="box quiz-box question-box">
          <div class="question-topline"><span class="eyebrow">QUESTION {{ String(currentNumber).padStart(2, '0') }} <span class="muted">/ {{ String(totalQuestions).padStart(2, '0') }}</span></span><span class="question-topic"><AppIcon name="globe" /> Currencies of the world</span></div>
          <progress class="progress is-primary round-progress" :value="progress" max="100" :aria-label="`${records.length} of ${totalQuestions} questions answered`">{{ Math.round(progress) }}%</progress>

          <form @submit.prevent="answerResult ? next() : submit()">
            <fieldset :disabled="isSubmitting || answerResult !== null">
              <legend ref="panelHeading" class="panel-title question-title" tabindex="-1">{{ currentQuestion.text }}</legend>
              <p class="muted question-instruction" id="answer-instruction">One question. One answer. Go with what you know.</p>
              <div class="answer-options" aria-describedby="answer-instruction">
                <label v-for="option, index in currentQuestion.options" :key="`${currentQuestion.id}-${option}`" class="answer-option" :class="{ 'is-selected': selectedAnswer === option, 'is-correct': selectedAnswer === option && answerResult?.correct, 'is-incorrect': selectedAnswer === option && answerResult?.correct === false }">
                  <input v-model="selectedAnswer" class="is-sr-only" type="radio" name="answer" :value="option" />
                  <span class="answer-letter">{{ String.fromCharCode(65 + index) }}</span>
                  <span class="answer-text"><strong>{{ option }}</strong></span>
                  <AppIcon v-if="selectedAnswer === option && answerResult" :name="answerResult.correct ? 'check' : 'close'" />
                  <span v-else class="answer-radio" aria-hidden="true"></span>
                </label>
              </div>
            </fieldset>

            <div v-if="answerResult" ref="feedback" class="notification answer-feedback" :class="answerResult.correct ? 'is-success is-light' : 'is-warning is-light'" tabindex="-1" role="status">
              <AppIcon :name="answerResult.correct ? 'check' : 'info'" />
              <p><strong>{{ answerResult.correct ? 'Right on the money!' : 'Not quite this time.' }}</strong><span>{{ answerResult.correct ? 'A little more of the world, well understood.' : 'Every question is part of the journey. Keep exploring.' }}</span></p>
            </div>
            <div v-if="error" class="notification is-danger is-light request-error" role="alert">
              <p>{{ retrySeconds > 0 ? 'A short pause — the quiz service limits how quickly answers can be checked.' : error }}</p>
              <p v-if="retrySeconds > 0" class="retry-countdown">Try again in {{ retrySeconds }} {{ retrySeconds === 1 ? 'second' : 'seconds' }}.</p>
              <button v-if="retrySeconds === 0" class="button is-small is-text" type="button" @click="load">Reload questions</button>
            </div>
            <button v-if="answerResult" class="button is-primary primary-action" type="submit">{{ currentNumber === totalQuestions ? 'See my results' : 'Next question' }}<AppIcon name="arrow" /></button>
            <button v-else class="button is-primary primary-action" :class="{ 'is-loading': isSubmitting }" type="submit" :disabled="selectedAnswer === null || isSubmitting || retrySeconds > 0">{{ retrySeconds > 0 ? `Try again in ${retrySeconds}s` : error ? 'Try my answer again' : 'Check my answer' }}<AppIcon name="arrow" /></button>
          </form>
          <div class="question-bottom"><span>No timer. Just you and your knowledge.</span><button class="button is-ghost" type="button" :disabled="isSubmitting" @click="exitDialog?.showModal()">Leave round</button></div>
        </div>

        <div v-else-if="phase === 'results'" class="box quiz-box results-box">
          <div class="panel-topline"><span class="eyebrow">ROUND COMPLETE</span><span class="tag available-tag"><AppIcon name="check" /> Nicely explored</span></div>
          <div class="score-display"><span class="score-number">{{ correctCount }}<span>/ {{ totalQuestions }}</span></span><span class="score-label">QUESTIONS CORRECT</span></div>
          <h2 ref="panelHeading" class="panel-title" tabindex="-1">{{ resultTitle }}</h2>
          <p class="muted">{{ scorePercent }}% correct, and a little more worldly than before.<br />There’s always another corner of the world to explore.</p>
          <button class="button is-primary primary-action" type="button" @click="restart"><AppIcon name="refresh" /> Play another round</button>
          <details class="answer-review">
            <summary>Your round, in review <span>{{ records.length }} answers</span></summary>
            <ol>
              <li v-for="record, index in records" :key="record.question.id">
                <span class="review-number">{{ String(index + 1).padStart(2, '0') }}</span>
                <div><p>{{ record.question.text }}</p><span>Your answer: <strong>{{ record.answer }}</strong></span></div>
                <span class="review-outcome" :class="record.correct ? 'has-text-success' : 'has-text-danger'"><AppIcon :name="record.correct ? 'check' : 'close'" /><span class="is-sr-only">{{ record.correct ? 'Correct' : 'Incorrect' }}</span></span>
              </li>
            </ol>
            <p class="review-note">Your score reflects the quiz service’s answer checks. Correct answers are kept private.</p>
          </details>
        </div>
        <p class="panel-footnote"><AppIcon name="check" /> A little learning. A lot of discovery.</p>
      </section>
    </main>

    <section class="how-it-works" aria-label="How the quiz works">
      <div class="how-heading"><span class="eyebrow">SMALL QUIZ.<br />WIDE WORLD.</span></div>
      <div class="how-step"><span class="step-number">01</span><div><h2>Pick your adventure</h2><p>A quick round or the whole collection.</p></div></div>
      <div class="how-step"><span class="step-number">02</span><div><h2>Make your choice</h2><p>One answer. A little intuition.</p></div></div>
      <div class="how-step"><span class="step-number">03</span><div><h2>See how you did</h2><p>A fresh score. A fresh perspective.</p></div></div>
    </section>
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
  <dialog ref="exitDialog" class="box help-dialog" aria-labelledby="exit-heading">
    <h2 id="exit-heading" class="panel-title">Leave this round?</h2>
    <p class="muted">Your progress in this round will be lost. You can start a fresh round whenever you like.</p>
    <div class="dialog-actions"><button class="button is-primary" type="button" @click="exitDialog?.close()">Keep playing</button><button class="button is-light" type="button" @click="leaveQuiz">Leave round</button></div>
  </dialog>
</template>
