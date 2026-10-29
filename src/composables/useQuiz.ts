import { computed, getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue'
import {
  ApiError,
  loadQuestions,
  submitAnswer,
  type AnswerResult,
  type Question,
} from '../api/client.ts'

export type QuizPhase = 'loading' | 'welcome' | 'playing' | 'results' | 'error' | 'empty'

export interface AnswerRecord {
  question: Question
  answer: string
  correct: boolean
}

interface QuizServices {
  loadQuestions: () => Promise<Question[]>
  submitAnswer: (questionId: string, answer: string) => Promise<AnswerResult>
  random: () => number
  now: () => number
}

/** One quiz session. The API remains the only source of answer correctness. */
export function useQuiz(services: Partial<QuizServices> = {}) {
  const api = { loadQuestions, submitAnswer, random: Math.random, now: Date.now, ...services }
  const phase = ref<QuizPhase>('loading')
  const questions = shallowRef<Question[]>([])
  const sessionQuestions = shallowRef<Question[]>([])
  const questionCount = ref(10)
  const questionIndex = ref(0)
  const selectedAnswer = ref<string | null>(null)
  const answerResult = shallowRef<AnswerResult | null>(null)
  const records = shallowRef<AnswerRecord[]>([])
  const error = ref<string | null>(null)
  const isSubmitting = ref(false)
  const retryAt = ref<number | null>(null)
  let operation = 0

  const currentQuestion = computed(() => sessionQuestions.value[questionIndex.value])
  const currentNumber = computed(() => questionIndex.value + 1)
  const totalQuestions = computed(() => sessionQuestions.value.length)
  const correctCount = computed(() => records.value.filter(({ correct }) => correct).length)
  const progress = computed(() => totalQuestions.value === 0 ? 0 : records.value.length / totalQuestions.value * 100)

  function clearSession() {
    operation++
    sessionQuestions.value = []
    questionIndex.value = 0
    selectedAnswer.value = null
    answerResult.value = null
    records.value = []
    error.value = null
    isSubmitting.value = false
    retryAt.value = null
  }

  async function load() {
    clearSession()
    const loadingOperation = operation
    questions.value = []
    phase.value = 'loading'
    try {
      const loaded = await api.loadQuestions()
      if (loadingOperation !== operation) return
      questions.value = loaded
      phase.value = loaded.length === 0 ? 'empty' : 'welcome'
    } catch (cause) {
      if (loadingOperation !== operation) return
      error.value = cause instanceof Error ? cause.message : 'The questions could not be loaded. Please try again.'
      phase.value = 'error'
    }
  }

  function start() {
    if (phase.value !== 'welcome' || questions.value.length === 0) return
    clearSession()
    const shuffled = [...questions.value]
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = Math.floor(api.random() * (index + 1))
      const item = shuffled[index]!
      shuffled[index] = shuffled[other]!
      shuffled[other] = item
    }
    const requested = Number.isFinite(questionCount.value) ? Math.max(1, Math.floor(questionCount.value)) : 10
    sessionQuestions.value = shuffled.slice(0, Math.min(requested, shuffled.length))
    phase.value = 'playing'
  }

  async function submit() {
    const question = currentQuestion.value
    if (phase.value !== 'playing' || !question || isSubmitting.value || answerResult.value) return
    if (retryAt.value !== null && api.now() < retryAt.value) return
    const answer = selectedAnswer.value
    if (answer === null || !question.options.includes(answer)) {
      error.value = 'Choose an answer before checking it.'
      return
    }

    const submittingOperation = operation
    isSubmitting.value = true
    error.value = null
    retryAt.value = null
    try {
      const result = await api.submitAnswer(question.id, answer)
      if (submittingOperation !== operation) return
      answerResult.value = result
      records.value = [...records.value, { question, answer, correct: result.correct }]
    } catch (cause) {
      if (submittingOperation !== operation) return
      error.value = cause instanceof Error ? cause.message : 'Your answer could not be checked. Please try again.'
      if (cause instanceof ApiError && cause.status === 429) {
        retryAt.value = api.now() + (cause.retryAfter ?? 60) * 1000
      }
    } finally {
      if (submittingOperation === operation) isSubmitting.value = false
    }
  }

  function next() {
    if (phase.value !== 'playing' || !answerResult.value || isSubmitting.value) return
    if (questionIndex.value + 1 >= totalQuestions.value) {
      phase.value = 'results'
      return
    }
    questionIndex.value++
    selectedAnswer.value = null
    answerResult.value = null
    error.value = null
    retryAt.value = null
  }

  function restart() {
    clearSession()
    phase.value = questions.value.length === 0 ? 'empty' : 'welcome'
  }

  // Invalidate pending work when the owning component goes away.
  if (getCurrentScope()) onScopeDispose(() => { operation++ })

  return {
    phase, questions, sessionQuestions, questionCount, questionIndex, currentNumber,
    currentQuestion, totalQuestions, selectedAnswer, answerResult, records,
    correctCount, progress, error, isSubmitting, retryAt,
    load, start, submit, next, restart,
  }
}
