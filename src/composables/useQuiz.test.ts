import assert from 'node:assert/strict'
import { test } from 'node:test'
import { effectScope } from 'vue'
import { ApiError, type AnswerResult, type Question } from '../api/client.ts'
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
