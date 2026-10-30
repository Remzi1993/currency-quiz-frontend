import { computed, getCurrentScope, onScopeDispose, ref, shallowRef, watch } from 'vue'
import {
  ApiError,
  loadQuestions,
  submitAnswer,
  type AnswerResult,
  type Question,
} from '../api/client.ts'
import { getQuizStorage, readQuizState, writeQuizState, type QuizStorage } from './quizStorage.ts'

export type QuizPhase = 'loading' | 'welcome' | 'playing' | 'results' | 'error' | 'empty'

export interface AnswerRecord {
  question: Question
  answer: string
  correct: boolean
}

interface QuizServices {
  loadQuestions: (signal?: AbortSignal) => Promise<Question[]>
  submitAnswer: (questionId: string, answer: string) => Promise<AnswerResult>
  random: () => number
  now: () => number
  storage: QuizStorage | null
}

const STARTUP_TIMEOUT_MS = 60_000
const STARTUP_RETRY_MS = 5_000

function waitForRetry(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel)
      resolve()
    }, milliseconds)
    function cancel() {
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      reject(signal.reason)
    }
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
  })
}

/** One quiz session. The API remains the only source of answer correctness. */
export function useQuiz(services: Partial<QuizServices> = {}) {
  const api = { loadQuestions, submitAnswer, random: Math.random, now: Date.now, ...services }
  const storage = services.storage === undefined ? getQuizStorage() : services.storage
  const savedState = readQuizState(storage)
  const phase = ref<QuizPhase>('loading')
  const questions = shallowRef<Question[]>([])
  const sessionQuestions = shallowRef<Question[]>([])
  const questionCount = ref(savedState?.questionCount ?? 10)
  const questionIndex = ref(0)
  const selectedAnswer = ref<string | null>(null)
  const answerResult = shallowRef<AnswerResult | null>(null)
  const records = shallowRef<AnswerRecord[]>([])
  const error = ref<string | null>(null)
  const isSubmitting = ref(false)
  const isWakingUp = ref(false)
  const retryAt = ref<number | null>(null)
  let operation = 0
  let cancelLoading: (() => void) | undefined
  let initialized = false
  let changingSession = false

  const currentQuestion = computed(() => sessionQuestions.value[questionIndex.value])
  const currentNumber = computed(() => questionIndex.value + 1)
  const totalQuestions = computed(() => sessionQuestions.value.length)
  const correctCount = computed(() => records.value.filter(({ correct }) => correct).length)
  const incorrectCount = computed(() => records.value.length - correctCount.value)
  const progress = computed(() => totalQuestions.value === 0 ? 0 : records.value.length / totalQuestions.value * 100)

  function persist() {
    writeQuizState(storage, {
      version: 1,
      questionCount: questionCount.value,
      session: phase.value === 'playing' || phase.value === 'results' ? {
        phase: phase.value,
        questions: questions.value,
        sessionQuestions: sessionQuestions.value,
        questionIndex: questionIndex.value,
        selectedAnswer: selectedAnswer.value,
        records: records.value,
        correctCount: correctCount.value,
        incorrectCount: incorrectCount.value,
        retryAt: retryAt.value,
        error: error.value,
      } : null,
    })
  }

  // Save a complete transition together, so no partial round is written between assignments.
  function changeSession(change: () => void) {
    changingSession = true
    try {
      change()
    } finally {
      changingSession = false
      persist()
    }
  }

  watch([questionCount, selectedAnswer], () => {
    if (!changingSession) persist()
  }, { flush: 'sync' })

  function clearSession() {
    operation++
    cancelLoading?.()
    cancelLoading = undefined
    isWakingUp.value = false
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
    changeSession(() => {
      clearSession()
      questions.value = []
      phase.value = 'loading'
    })
    const loadingOperation = operation
    const controller = new AbortController()
    const deadline = api.now() + STARTUP_TIMEOUT_MS
    const timeoutError = new DOMException('Question loading timed out', 'TimeoutError')
    const timeout = setTimeout(() => controller.abort(timeoutError), STARTUP_TIMEOUT_MS)
    cancelLoading = () => {
      clearTimeout(timeout)
      controller.abort()
    }
    try {
      while (true) {
        if (controller.signal.aborted || api.now() >= deadline) {
          controller.abort(timeoutError)
          throw controller.signal.reason
        }
        try {
          const loaded = await api.loadQuestions(controller.signal)
          if (loadingOperation !== operation) return
          if (controller.signal.aborted) throw controller.signal.reason
          questions.value = loaded
          phase.value = loaded.length === 0 ? 'empty' : 'welcome'
          return
        } catch (cause) {
          if (loadingOperation !== operation) return
          if (!(cause instanceof ApiError) || cause.status !== 503) throw cause
          // Only an actual HTTP 503 starts the Render wake-up experience.
          isWakingUp.value = true
          await waitForRetry(Math.min(STARTUP_RETRY_MS, Math.max(0, deadline - api.now())), controller.signal)
        }
      }
    } catch (cause) {
      if (loadingOperation !== operation) return
      error.value = controller.signal.aborted
        ? isWakingUp.value
          ? 'The quiz service is still unavailable after one minute. There may be a hosting or backend problem. Please try again later.'
          : 'The quiz service took too long to respond. Please try again.'
        : cause instanceof Error ? cause.message : 'The questions could not be loaded. Please try again.'
      phase.value = 'error'
    } finally {
      clearTimeout(timeout)
      if (loadingOperation === operation) {
        cancelLoading = undefined
        isWakingUp.value = false
      }
    }
  }

  async function initialize() {
    if (initialized) return
    initialized = true
    const session = savedState?.session
    if (!session) {
      await load()
      return
    }
    changeSession(() => {
      clearSession()
      questions.value = session.questions
      sessionQuestions.value = session.sessionQuestions
      questionIndex.value = session.questionIndex
      selectedAnswer.value = session.selectedAnswer
      records.value = session.records
      const currentRecord = session.records[session.questionIndex]
      answerResult.value = currentRecord ? { correct: currentRecord.correct } : null
      retryAt.value = session.retryAt
      error.value = session.error
      phase.value = session.phase
    })
  }

  function start() {
    if (phase.value !== 'welcome' || questions.value.length === 0) return
    changeSession(() => {
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
    })
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
    persist()
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
      if (submittingOperation === operation) {
        isSubmitting.value = false
        persist()
      }
    }
  }

  function next() {
    if (phase.value !== 'playing' || !answerResult.value || isSubmitting.value) return
    changeSession(() => {
      if (questionIndex.value + 1 >= totalQuestions.value) {
        phase.value = 'results'
        return
      }
      questionIndex.value++
      selectedAnswer.value = null
      answerResult.value = null
      error.value = null
      retryAt.value = null
    })
  }

  function restart() {
    changeSession(() => {
      clearSession()
      phase.value = questions.value.length === 0 ? 'empty' : 'welcome'
    })
  }

  // Invalidate pending work when the owning component goes away.
  if (getCurrentScope()) onScopeDispose(() => {
    operation++
    cancelLoading?.()
    cancelLoading = undefined
  })

  return {
    phase, questions, sessionQuestions, questionCount, questionIndex, currentNumber,
    currentQuestion, totalQuestions, selectedAnswer, answerResult, records,
    correctCount, incorrectCount, progress, error, isSubmitting, isWakingUp, retryAt,
    initialize, load, start, submit, next, restart,
  }
}
