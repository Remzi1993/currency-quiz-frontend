import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { effectScope } from 'vue'
import { ApiError, type AnswerResult, type Question } from '../api/client.ts'
import { QUIZ_STORAGE_KEY, readQuizState, type QuizStorage } from './quizStorage.ts'
import { useQuiz } from './useQuiz.ts'

const questions: Question[] = [
  { id: '00000000-0000-0000-0000-000000000001', text: 'Currency of Japan?', options: ['JPY', 'EUR'] },
  { id: '00000000-0000-0000-0000-000000000002', text: 'Currency of the UK?', options: ['GBP', 'USD'] },
  { id: '00000000-0000-0000-0000-000000000003', text: 'Currency of the USA?', options: ['USD', 'JPY'] },
]

function fixture(overrides: Parameters<typeof useQuiz>[0] = {}) {
  return useQuiz({
    loadQuestions: async () => questions,
    submitAnswer: async () => ({ correct: true }),
    random: () => 0,
    storage: null,
    ...overrides,
  })
}

test('loads empty/error states and can recover with another load', async () => {
  let attempts = 0
  const quiz = fixture({ loadQuestions: async () => {
    if (++attempts === 1) throw new Error('Service unavailable')
    return attempts === 2 ? [] : questions
  } })
  await quiz.load()
  assert.equal(quiz.phase.value, 'error')
  assert.equal(quiz.error.value, 'Service unavailable')
  await quiz.load()
  assert.equal(quiz.phase.value, 'empty')
  assert.equal(quiz.error.value, null)
  await quiz.load()
  assert.equal(quiz.phase.value, 'welcome')
})

test('shuffles a copy, caps the session size, and preserves the source bank', async () => {
  const quiz = fixture()
  await quiz.load()
  quiz.questionCount.value = 50
  quiz.start()
  assert.equal(quiz.phase.value, 'playing')
  assert.equal(quiz.totalQuestions.value, 3)
  assert.deepEqual(quiz.sessionQuestions.value.map(({ id }) => id), [questions[1]!.id, questions[2]!.id, questions[0]!.id])
  assert.deepEqual(quiz.questions.value, questions)
  quiz.restart()
  quiz.questionCount.value = 2
  quiz.start()
  assert.equal(quiz.totalQuestions.value, 2)
})

test('only server results advance scoring; next cannot skip unanswered questions', async () => {
  const submitted: Array<{ id: string; answer: string }> = []
  const quiz = fixture({ submitAnswer: async (id, answer) => {
    submitted.push({ id, answer })
    return { correct: submitted.length === 1 }
  } })
  await quiz.load()
  quiz.questionCount.value = 2
  quiz.start()
  quiz.next()
  assert.equal(quiz.questionIndex.value, 0)
  await quiz.submit()
  assert.equal(submitted.length, 0)
  assert.equal(quiz.error.value, 'Choose an answer before checking it.')
  quiz.selectedAnswer.value = quiz.currentQuestion.value!.options[0]!
  await quiz.submit()
  await quiz.submit()
  assert.equal(submitted.length, 1)
  assert.deepEqual(submitted[0], { id: questions[1]!.id, answer: 'GBP' })
  assert.equal(quiz.correctCount.value, 1)
  assert.equal(quiz.progress.value, 50)
  quiz.next()
  assert.equal(quiz.currentNumber.value, 2)
  assert.equal(quiz.selectedAnswer.value, null)
  quiz.selectedAnswer.value = quiz.currentQuestion.value!.options[0]!
  await quiz.submit()
  assert.equal(quiz.answerResult.value?.correct, false)
  assert.equal(quiz.correctCount.value, 1)
  assert.equal(quiz.progress.value, 100)
  quiz.next()
  assert.equal(quiz.phase.value, 'results')
  assert.equal(quiz.records.value.length, 2)
  quiz.restart()
  assert.equal(quiz.phase.value, 'welcome')
  assert.equal(quiz.records.value.length, 0)
  assert.equal(quiz.answerResult.value, null)
  assert.equal(quiz.selectedAnswer.value, null)
  assert.equal(quiz.correctCount.value, 0)
})

test('locks concurrent submissions and ignores responses from an abandoned session', async () => {
  let resolveAnswer!: (answer: AnswerResult) => void
  let calls = 0
  const quiz = fixture({ submitAnswer: () => {
    calls++
    return new Promise((resolve) => { resolveAnswer = resolve })
  } })
  await quiz.load()
  quiz.start()
  quiz.selectedAnswer.value = quiz.currentQuestion.value!.options[0]!
  const pending = quiz.submit()
  await quiz.submit()
  assert.equal(calls, 1)
  assert.equal(quiz.isSubmitting.value, true)
  quiz.restart()
  resolveAnswer({ correct: true })
  await pending
  assert.equal(quiz.phase.value, 'welcome')
  assert.equal(quiz.records.value.length, 0)
  assert.equal(quiz.isSubmitting.value, false)
})

test('failed submissions preserve the selection and progress for a retry', async () => {
  let attempts = 0
  const quiz = fixture({ submitAnswer: async () => {
    if (++attempts === 1) throw new Error('Connection lost')
    return { correct: false }
  } })
  await quiz.load()
  quiz.start()
  quiz.selectedAnswer.value = quiz.currentQuestion.value!.options[0]!
  const answer = quiz.selectedAnswer.value
  await quiz.submit()
  assert.equal(quiz.error.value, 'Connection lost')
  assert.equal(quiz.selectedAnswer.value, answer)
  assert.equal(quiz.records.value.length, 0)
  assert.equal(quiz.progress.value, 0)
  await quiz.submit()
  assert.equal(quiz.error.value, null)
  assert.equal(quiz.records.value.length, 1)
})

test('honors Retry-After before allowing another submission', async () => {
  let now = 1000
  let calls = 0
  const quiz = fixture({ now: () => now, submitAnswer: async () => {
    if (++calls === 1) throw new ApiError('Too many requests', { status: 429, retryAfter: 3 })
    return { correct: true }
  } })
  await quiz.load()
  quiz.start()
  quiz.selectedAnswer.value = quiz.currentQuestion.value!.options[0]!
  await quiz.submit()
  assert.equal(quiz.retryAt.value, 4000)
  await quiz.submit()
  assert.equal(calls, 1)
  now = 4000
  await quiz.submit()
  assert.equal(calls, 2)
  assert.equal(quiz.retryAt.value, null)
  assert.equal(quiz.correctCount.value, 1)
})

test('ignores stale loads and pending responses after scope disposal', async () => {
  let resolveLoad!: (questions: Question[]) => void
  const scope = effectScope()
  const quiz = scope.run(() => fixture({ loadQuestions: () => new Promise((resolve) => { resolveLoad = resolve }) }))!
  const pending = quiz.load()
  scope.stop()
  resolveLoad(questions)
  await pending
  assert.equal(quiz.questions.value.length, 0)
  assert.equal(quiz.phase.value, 'loading')
})

test('keeps the loading screen during HTTP 503 wake-up retries and clears it on success', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  const requestTimes: number[] = []
  const quiz = fixture({ loadQuestions: async () => {
    requestTimes.push(Date.now())
    if (requestTimes.length < 3) throw new ApiError('Service unavailable', { status: 503 })
    return questions
  } })
  const pending = quiz.load()
  await setImmediate()
  assert.equal(quiz.phase.value, 'loading')
  assert.equal(quiz.isWakingUp.value, true)
  assert.equal(quiz.error.value, null)

  t.mock.timers.tick(4999)
  await setImmediate()
  assert.deepEqual(requestTimes, [0])
  t.mock.timers.tick(1)
  await setImmediate()
  assert.deepEqual(requestTimes, [0, 5000])
  assert.equal(quiz.phase.value, 'loading')
  assert.equal(quiz.isWakingUp.value, true)

  t.mock.timers.tick(5000)
  await pending
  assert.deepEqual(requestTimes, [0, 5000, 10000])
  assert.equal(quiz.phase.value, 'welcome')
  assert.equal(quiz.isWakingUp.value, false)
  assert.equal(quiz.error.value, null)
  assert.deepEqual(quiz.questions.value, questions)
  t.mock.timers.tick(60_000)
  await setImmediate()
  assert.equal(requestTimes.length, 3)
})

test('does not retry other HTTP statuses, network errors, timeouts, or invalid responses', async (t) => {
  const failures = [
    new ApiError('Internal server error', { status: 500 }),
    new ApiError('Bad gateway', { status: 502 }),
    new ApiError('Origin forbidden', { status: 403 }),
    new ApiError('Too many requests', { status: 429, retryAfter: 5 }),
    new ApiError('Could not reach the quiz service', { cause: new TypeError('Failed to fetch') }),
    new ApiError('The request timed out', { cause: new DOMException('Timed out', 'TimeoutError') }),
    new ApiError('The quiz service returned invalid questions'),
  ]
  for (const failure of failures) {
    for (const after503 of [false, true]) {
      await t.test(`${failure.message}${after503 ? ' after HTTP 503' : ' on the first request'}`, async (caseTest) => {
        caseTest.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
        let calls = 0
        const quiz = fixture({ loadQuestions: async () => {
          calls++
          if (after503 && calls === 1) throw new ApiError('Service unavailable', { status: 503 })
          throw failure
        } })
        const pending = quiz.load()
        await setImmediate()
        if (after503) {
          assert.equal(quiz.isWakingUp.value, true)
          caseTest.mock.timers.tick(5000)
        }
        await pending
        assert.equal(quiz.phase.value, 'error')
        assert.equal(quiz.isWakingUp.value, false)
        assert.equal(quiz.error.value, failure.message)
        assert.equal(calls, after503 ? 2 : 1)
        caseTest.mock.timers.tick(120_000)
        await setImmediate()
        assert.equal(calls, after503 ? 2 : 1)
      })
    }
  }
})

test('includes the initial request in the one-minute wake-up budget and allows manual recovery', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  const requestTimes: number[] = []
  let available = false
  const quiz = fixture({ loadQuestions: async () => {
    requestTimes.push(Date.now())
    if (available) return questions
    if (requestTimes.length === 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10_000))
    }
    throw new ApiError('Service unavailable', { status: 503 })
  } })
  const pending = quiz.load()
  t.mock.timers.tick(10_000)
  await setImmediate()
  assert.equal(quiz.isWakingUp.value, true)
  for (let elapsed = 15_000; elapsed <= 55_000; elapsed += 5000) {
    t.mock.timers.tick(5000)
    await setImmediate()
    assert.equal(quiz.phase.value, 'loading')
  }
  assert.deepEqual(requestTimes, [0, 15_000, 20_000, 25_000, 30_000, 35_000, 40_000, 45_000, 50_000, 55_000])
  t.mock.timers.tick(5000)
  await pending
  assert.equal(Date.now(), 60_000)
  assert.equal(quiz.phase.value, 'error')
  assert.equal(quiz.isWakingUp.value, false)
  assert.match(quiz.error.value!, /still unavailable after one minute/)
  t.mock.timers.tick(120_000)
  await setImmediate()
  assert.equal(requestTimes.length, 10)

  available = true
  await quiz.load()
  assert.equal(quiz.phase.value, 'welcome')
  assert.equal(quiz.error.value, null)
  assert.equal(quiz.isWakingUp.value, false)
  assert.deepEqual(quiz.questions.value, questions)
})

test('aborts a hung retry at one minute measured from the initial GET', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  const requestTimes: number[] = []
  let retrySignal: AbortSignal | undefined
  let abortedAt: number | undefined
  const quiz = fixture({ loadQuestions: async (signal) => {
    requestTimes.push(Date.now())
    if (requestTimes.length === 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 12_000))
      throw new ApiError('Service unavailable', { status: 503 })
    }
    retrySignal = signal
    return new Promise<Question[]>((_resolve, reject) => {
      signal!.addEventListener('abort', () => {
        abortedAt = Date.now()
        reject(signal!.reason)
      }, { once: true })
    })
  } })
  const pending = quiz.load()
  t.mock.timers.tick(12_000)
  await setImmediate()
  t.mock.timers.tick(5000)
  await setImmediate()
  assert.deepEqual(requestTimes, [0, 17_000])
  assert.equal(retrySignal?.aborted, false)
  assert.equal(quiz.isWakingUp.value, true)
  t.mock.timers.tick(42_999)
  await setImmediate()
  assert.equal(quiz.phase.value, 'loading')
  assert.equal(retrySignal?.aborted, false)
  t.mock.timers.tick(1)
  await pending
  assert.equal(abortedAt, 60_000)
  assert.equal(retrySignal?.aborted, true)
  assert.equal(quiz.phase.value, 'error')
  assert.equal(quiz.isWakingUp.value, false)
  assert.match(quiz.error.value!, /still unavailable after one minute/)
})

test('reloading cancels the old wake-up delay and keeps the newer load result', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  let calls = 0
  let firstSignal: AbortSignal | undefined
  const quiz = fixture({ loadQuestions: async (signal) => {
    if (++calls === 1) {
      firstSignal = signal
      throw new ApiError('Service unavailable', { status: 503 })
    }
    return questions
  } })
  const abandoned = quiz.load()
  await setImmediate()
  assert.equal(quiz.isWakingUp.value, true)
  t.mock.timers.tick(2500)
  await quiz.load()
  await abandoned
  assert.equal(firstSignal?.aborted, true)
  assert.equal(quiz.phase.value, 'welcome')
  assert.equal(quiz.isWakingUp.value, false)
  t.mock.timers.tick(120_000)
  await setImmediate()
  assert.equal(calls, 2)
  assert.deepEqual(quiz.questions.value, questions)
})

test('scope disposal cancels the wake-up delay without another request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  let calls = 0
  let signal: AbortSignal | undefined
  const scope = effectScope()
  const quiz = scope.run(() => fixture({ loadQuestions: async (requestSignal) => {
    calls++
    signal = requestSignal
    throw new ApiError('Service unavailable', { status: 503 })
  } }))!
  const pending = quiz.load()
  await setImmediate()
  assert.equal(quiz.isWakingUp.value, true)
  scope.stop()
  await pending
  assert.equal(signal?.aborted, true)
  t.mock.timers.tick(120_000)
  await setImmediate()
  assert.equal(calls, 1)
  assert.equal(quiz.questions.value.length, 0)
  assert.equal(quiz.error.value, null)
})

function memoryStorage() {
  const values = new Map<string, string>()
  const storage: QuizStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
  }
  return { storage, values }
}

test('saves the preferred question count immediately without requiring a round', async () => {
  const { storage } = memoryStorage()
  const quiz = fixture({ storage })
  quiz.questionCount.value = 2
  assert.deepEqual(readQuizState(storage), { version: 1, questionCount: 2, session: null })

  let loads = 0
  const restored = fixture({ storage, loadQuestions: async () => { loads++; return questions } })
  assert.equal(restored.questionCount.value, 2)
  await restored.initialize()
  assert.equal(loads, 1)
  assert.equal(restored.phase.value, 'welcome')
  assert.equal(restored.questionCount.value, 2)
  assert.equal(restored.correctCount.value, 0)
  assert.equal(restored.incorrectCount.value, 0)
})

test('restores an unanswered round, its shuffled order and selected answer without contacting the backend', async () => {
  const { storage, values } = memoryStorage()
  const quiz = fixture({ storage })
  await quiz.initialize()
  quiz.questionCount.value = 2
  quiz.start()
  quiz.selectedAnswer.value = quiz.currentQuestion.value!.options[1]!
  const order = quiz.sessionQuestions.value.map(({ id }) => id)
  assert.equal(values.has(QUIZ_STORAGE_KEY), true)

  let calls = 0
  const unavailable = async (): Promise<never> => { calls++; throw new Error('Backend unavailable') }
  const restored = fixture({ storage, loadQuestions: unavailable, submitAnswer: unavailable })
  await restored.initialize()
  assert.equal(calls, 0)
  assert.equal(restored.phase.value, 'playing')
  assert.equal(restored.questionCount.value, 2)
  assert.equal(restored.questionIndex.value, 0)
  assert.deepEqual(restored.questions.value, questions)
  assert.deepEqual(restored.sessionQuestions.value.map(({ id }) => id), order)
  assert.equal(restored.selectedAnswer.value, quiz.selectedAnswer.value)
  assert.equal(restored.answerResult.value, null)
  assert.equal(restored.records.value.length, 0)
  assert.equal(restored.isSubmitting.value, false)
})

test('restores correct feedback and prevents submitting the checked answer a second time', async () => {
  const { storage } = memoryStorage()
  const quiz = fixture({ storage })
  await quiz.initialize()
  quiz.questionCount.value = 2
  quiz.start()
  quiz.selectedAnswer.value = quiz.currentQuestion.value!.options[0]!
  await quiz.submit()

  let posts = 0
  const restored = fixture({ storage, submitAnswer: async () => { posts++; return { correct: false } } })
  await restored.initialize()
  assert.equal(restored.phase.value, 'playing')
  assert.equal(restored.correctCount.value, 1)
  assert.equal(restored.incorrectCount.value, 0)
  assert.equal(restored.answerResult.value?.correct, true)
  assert.equal(restored.selectedAnswer.value, quiz.selectedAnswer.value)
  assert.deepEqual(restored.records.value, quiz.records.value)
  await restored.submit()
  assert.equal(posts, 0)
  assert.equal(restored.records.value.length, 1)
  restored.next()
  assert.equal(restored.questionIndex.value, 1)
  assert.equal(restored.selectedAnswer.value, null)
  assert.equal(restored.answerResult.value, null)
})

test('restores a later unanswered question, selection and previous score in the original order', async () => {
  const { storage } = memoryStorage()
  const quiz = fixture({ storage })
  await quiz.initialize()
  quiz.start()
  quiz.selectedAnswer.value = quiz.currentQuestion.value!.options[0]!
  await quiz.submit()
  quiz.next()
  quiz.selectedAnswer.value = quiz.currentQuestion.value!.options[1]!

  const restored = fixture({ storage })
  await restored.initialize()
  assert.equal(restored.questionIndex.value, 1)
  assert.equal(restored.currentNumber.value, 2)
  assert.equal(restored.currentQuestion.value?.id, quiz.currentQuestion.value?.id)
  assert.deepEqual(restored.sessionQuestions.value, quiz.sessionQuestions.value)
  assert.equal(restored.selectedAnswer.value, quiz.selectedAnswer.value)
  assert.equal(restored.answerResult.value, null)
  assert.equal(restored.correctCount.value, 1)
  assert.equal(restored.incorrectCount.value, 0)
  assert.equal(restored.records.value.length, 1)
  assert.ok(Math.abs(restored.progress.value - 100 / 3) < 1e-9)
})

test('restores incorrect feedback together with both correct and incorrect totals', async () => {
  const { storage } = memoryStorage()
  let submissions = 0
  const quiz = fixture({ storage, submitAnswer: async () => ({ correct: ++submissions === 1 }) })
  await quiz.initialize()
  quiz.questionCount.value = 2
  quiz.start()
  quiz.selectedAnswer.value = quiz.currentQuestion.value!.options[0]!
  await quiz.submit()
  quiz.next()
  quiz.selectedAnswer.value = quiz.currentQuestion.value!.options[1]!
  await quiz.submit()

  const restored = fixture({ storage, submitAnswer: async () => { submissions++; return { correct: true } } })
  await restored.initialize()
  assert.equal(restored.phase.value, 'playing')
  assert.equal(restored.questionIndex.value, 1)
  assert.equal(restored.answerResult.value?.correct, false)
  assert.equal(restored.correctCount.value, 1)
  assert.equal(restored.incorrectCount.value, 1)
  assert.equal(restored.progress.value, 100)
  assert.deepEqual(restored.records.value, quiz.records.value)
  await restored.submit()
  assert.equal(submissions, 2)
  restored.next()
  assert.equal(restored.phase.value, 'results')
})

test('restores the completed results and review records without fetching or posting', async () => {
  const { storage } = memoryStorage()
  let submissions = 0
  const quiz = fixture({ storage, submitAnswer: async () => ({ correct: ++submissions === 1 }) })
  await quiz.initialize()
  quiz.questionCount.value = 2
  quiz.start()
  for (let index = 0; index < 2; index++) {
    quiz.selectedAnswer.value = quiz.currentQuestion.value!.options[0]!
    await quiz.submit()
    quiz.next()
  }
  assert.equal(quiz.phase.value, 'results')

  let requests = 0
  const unavailable = async (): Promise<never> => { requests++; throw new Error('Backend unavailable') }
  const restored = fixture({ storage, loadQuestions: unavailable, submitAnswer: unavailable })
  await restored.initialize()
  assert.equal(requests, 0)
  assert.equal(restored.phase.value, 'results')
  assert.equal(restored.currentNumber.value, 2)
  assert.equal(restored.totalQuestions.value, 2)
  assert.equal(restored.correctCount.value, 1)
  assert.equal(restored.incorrectCount.value, 1)
  assert.equal(restored.progress.value, 100)
  assert.deepEqual(restored.records.value, quiz.records.value)
  await restored.submit()
  assert.equal(requests, 0)
})

test('leaving or replaying clears the saved round while keeping its count preference', async () => {
  for (const complete of [false, true]) {
    const { storage } = memoryStorage()
    const quiz = fixture({ storage })
    await quiz.initialize()
    quiz.questionCount.value = 1
    quiz.start()
    quiz.selectedAnswer.value = quiz.currentQuestion.value!.options[0]!
    if (complete) {
      await quiz.submit()
      quiz.next()
      assert.equal(quiz.phase.value, 'results')
    }
    quiz.restart()
    assert.deepEqual(readQuizState(storage), { version: 1, questionCount: 1, session: null })
    assert.equal(quiz.correctCount.value, 0)
    assert.equal(quiz.incorrectCount.value, 0)

    let loads = 0
    const restored = fixture({ storage, loadQuestions: async () => { loads++; return questions } })
    await restored.initialize()
    assert.equal(loads, 1)
    assert.equal(restored.phase.value, 'welcome')
    assert.equal(restored.questionCount.value, 1)
    assert.equal(restored.records.value.length, 0)
  }
})

test('an explicit question reload replaces a saved round and retains the count preference', async () => {
  const { storage } = memoryStorage()
  let loads = 0
  const quiz = fixture({ storage, loadQuestions: async () => { loads++; return questions } })
  await quiz.initialize()
  quiz.questionCount.value = 2
  quiz.start()
  quiz.selectedAnswer.value = quiz.currentQuestion.value!.options[0]!
  await quiz.submit()
  await quiz.load()
  assert.equal(loads, 2)
  assert.equal(quiz.phase.value, 'welcome')
  assert.equal(quiz.questionCount.value, 2)
  assert.equal(quiz.records.value.length, 0)
  assert.deepEqual(readQuizState(storage), { version: 1, questionCount: 2, session: null })
})

test('blocked browser storage does not prevent loading, playing or replaying', async () => {
  const blocked: QuizStorage = {
    getItem: () => { throw new DOMException('Blocked', 'SecurityError') },
    setItem: () => { throw new DOMException('Blocked', 'SecurityError') },
    removeItem: () => { throw new DOMException('Blocked', 'SecurityError') },
  }
  const quiz = fixture({ storage: blocked })
  await quiz.initialize()
  quiz.questionCount.value = 1
  quiz.start()
  quiz.selectedAnswer.value = quiz.currentQuestion.value!.options[0]!
  await quiz.submit()
  quiz.next()
  assert.equal(quiz.phase.value, 'results')
  assert.equal(quiz.correctCount.value, 1)
  quiz.restart()
  assert.equal(quiz.phase.value, 'welcome')
  assert.equal(quiz.questionCount.value, 1)
})

test('restores the absolute rate-limit deadline and retries only after a new user submission', async () => {
  const { storage } = memoryStorage()
  let now = 1000
  const quiz = fixture({ storage, now: () => now, submitAnswer: async () => {
    throw new ApiError('Too many requests', { status: 429, retryAfter: 3 })
  } })
  await quiz.initialize()
  quiz.start()
  quiz.selectedAnswer.value = quiz.currentQuestion.value!.options[0]!
  await quiz.submit()
  assert.equal(quiz.retryAt.value, 4000)

  now = 2000
  let posts = 0
  const restored = fixture({ storage, now: () => now, submitAnswer: async () => {
    posts++
    return { correct: true }
  } })
  await restored.initialize()
  assert.equal(posts, 0)
  assert.equal(restored.phase.value, 'playing')
  assert.equal(restored.retryAt.value, 4000)
  assert.equal(restored.error.value, 'Too many requests')
  assert.equal(restored.selectedAnswer.value, quiz.selectedAnswer.value)
  assert.equal(restored.records.value.length, 0)
  assert.equal(restored.answerResult.value, null)
  await restored.submit()
  assert.equal(posts, 0)
  now = 4000
  assert.equal(posts, 0)
  await restored.submit()
  assert.equal(posts, 1)
  assert.equal(restored.retryAt.value, null)
  assert.equal(restored.error.value, null)
  assert.equal(restored.correctCount.value, 1)
})
