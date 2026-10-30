import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getQuizStorage, QUIZ_STORAGE_KEY, readQuizState, writeQuizState,
  type QuizStorage, type StoredQuizSession, type StoredQuizState,
} from './quizStorage.ts'

const questions = [
  { id: '00000000-0000-0000-0000-000000000001', text: 'Currency of Japan?', options: ['JPY', 'EUR'] },
  { id: '00000000-0000-0000-0000-000000000002', text: 'Currency of the UK?', options: ['GBP', 'USD'] },
  { id: '00000000-0000-0000-0000-000000000003', text: 'Currency of the USA?', options: ['USD', 'JPY'] },
]

function session(overrides: Partial<StoredQuizSession> = {}): StoredQuizSession {
  return {
    phase: 'playing', questions: structuredClone(questions),
    sessionQuestions: structuredClone([questions[2]!, questions[0]!]),
    questionIndex: 0, selectedAnswer: null, records: [], retryAt: null,
    correctCount: 0, incorrectCount: 0, error: null, ...overrides,
  }
}

function state(savedSession: StoredQuizSession | null = session()): StoredQuizState {
  return { version: 1, questionCount: 2, session: savedSession }
}

function memoryStorage(initial?: unknown) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(QUIZ_STORAGE_KEY, JSON.stringify(initial))
  const storage: QuizStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
  }
  return { storage, values }
}

test('round trips selected count, question order, current selection and rate-limit state', () => {
  const saved = state(session({ selectedAnswer: 'JPY', retryAt: 12345, error: 'Too many requests' }))
  const { storage, values } = memoryStorage()
  writeQuizState(storage, saved)
  assert.deepEqual(readQuizState(storage), saved)
  assert.deepEqual([...values.keys()], [QUIZ_STORAGE_KEY])
})

test('preserves a count preference without a current round, including arbitrary positive counts', () => {
  for (const count of [1, 2, 10, 20, 40]) {
    const saved = { ...state(null), questionCount: count }
    assert.deepEqual(readQuizState(memoryStorage(saved).storage), saved)
  }
})

test('restores both checked feedback and the next unanswered question', () => {
  const record = { question: structuredClone(questions[2]!), answer: 'USD', correct: true }
  for (const savedSession of [
    session({ selectedAnswer: 'USD', records: [record], correctCount: 1 }),
    session({ questionIndex: 1, selectedAnswer: 'EUR', records: [record], correctCount: 1 }),
  ]) {
    const saved = state(savedSession)
    assert.deepEqual(readQuizState(memoryStorage(saved).storage), saved)
  }
})

test('restores a fully answered results page with correct and incorrect totals', () => {
  const saved = state(session({
    phase: 'results', questionIndex: 1, selectedAnswer: 'EUR',
    records: [
      { question: structuredClone(questions[2]!), answer: 'USD', correct: true },
      { question: structuredClone(questions[0]!), answer: 'EUR', correct: false },
    ],
    correctCount: 1, incorrectCount: 1,
  }))
  assert.deepEqual(readQuizState(memoryStorage(saved).storage), saved)
})

test('discards malformed JSON, unsupported versions and incomplete state safely', () => {
  const invalid = [
    null, [], {}, 42, { ...state(), version: 2 }, { ...state(), version: '1' },
    { ...state(), questionCount: 0 }, { ...state(), questionCount: -2 },
    { ...state(), questionCount: 1.5 }, { ...state(), questionCount: '10' },
    { ...state(), questionCount: Number.MAX_SAFE_INTEGER + 1 },
    { ...state(), questionCount: 1 }, { ...state(), questionCount: 3 },
    { version: 1, questionCount: 2 }, { ...state(), session: {} },
    { ...state(), unexpected: true },
  ]
  for (const payload of invalid) {
    const { storage, values } = memoryStorage(payload)
    assert.equal(readQuizState(storage), null)
    assert.equal(values.has(QUIZ_STORAGE_KEY), false)
  }
  const { storage, values } = memoryStorage()
  values.set(QUIZ_STORAGE_KEY, '{not JSON')
  assert.equal(readQuizState(storage), null)
  assert.equal(values.has(QUIZ_STORAGE_KEY), false)
})

test('rejects broken or inconsistent question snapshots instead of guessing a round', () => {
  const invalidSessions = [
    session({ phase: 'welcome' as 'playing' }),
    session({ questions: [] }), session({ sessionQuestions: [] }),
    session({ questions: [questions[0]!, questions[0]!] }),
    session({ sessionQuestions: [questions[2]!, questions[2]!] }),
    session({ sessionQuestions: [{ ...questions[2]!, text: 'Changed after saving' }, questions[0]!] }),
    session({ sessionQuestions: [{ ...questions[2]!, options: ['JPY', 'USD'] }, questions[0]!] }),
    session({ questions: [questions[0]!, questions[1]!] }),
    session({ questions: [{ ...questions[0]!, options: ['JPY'] }, questions[1]!, questions[2]!] }),
    session({ questionIndex: -1 }), session({ questionIndex: 0.5 }), session({ questionIndex: 2 }),
    session({ selectedAnswer: 'Not an option' }),
    session({ retryAt: -1 }), session({ retryAt: 1.5 }),
    session({ error: {} as string }),
  ]
  for (const saved of invalidSessions) assert.equal(readQuizState(memoryStorage(state(saved)).storage), null)
  const leakedAnswer = { ...questions[2]!, correctAnswer: 'USD' }
  assert.equal(readQuizState(memoryStorage(state(session({ sessionQuestions: [leakedAnswer, questions[0]!] }))).storage), null)
})

test('rejects records that are not the answered prefix or do not match the current selection', () => {
  const first = { question: questions[2]!, answer: 'USD', correct: true }
  const second = { question: questions[0]!, answer: 'EUR', correct: false }
  const invalidSessions = [
    session({ questionIndex: 1 }),
    session({ records: [first], correctCount: 1, selectedAnswer: null }),
    session({ records: [first], correctCount: 1, selectedAnswer: 'JPY' }),
    session({ records: [second], incorrectCount: 1, selectedAnswer: 'USD' }),
    session({ records: [{ ...first, answer: 'Not an option' }], correctCount: 1, selectedAnswer: 'USD' }),
    session({ records: [{ ...first, correct: 'true' as unknown as boolean }], correctCount: 1, selectedAnswer: 'USD' }),
    session({ records: [first, second], correctCount: 1, incorrectCount: 1, selectedAnswer: 'USD' }),
    session({ records: [first], selectedAnswer: 'USD', correctCount: 0 }),
    session({ records: [first], selectedAnswer: 'USD', correctCount: 1, incorrectCount: 1 }),
    session({ records: [first], selectedAnswer: 'USD', correctCount: 1, retryAt: 12345 }),
    session({ records: [first], selectedAnswer: 'USD', correctCount: 1, error: 'Stale failure' }),
    session({ phase: 'results', records: [first], selectedAnswer: 'USD', correctCount: 1 }),
    session({ phase: 'results', questionIndex: 0, records: [first, second], selectedAnswer: 'USD', correctCount: 1, incorrectCount: 1 }),
  ]
  for (const saved of invalidSessions) assert.equal(readQuizState(memoryStorage(state(saved)).storage), null)
})

test('missing or blocked storage and failed writes never stop a quiz', () => {
  assert.equal(readQuizState(null), null)
  assert.equal(readQuizState(memoryStorage().storage), null)
  assert.doesNotThrow(() => writeQuizState(null, state()))

  const blocked: QuizStorage = {
    getItem() { throw new DOMException('Blocked', 'SecurityError') },
    setItem() { throw new DOMException('Full', 'QuotaExceededError') },
    removeItem() { throw new DOMException('Blocked', 'SecurityError') },
  }
  assert.equal(readQuizState(blocked), null)
  assert.doesNotThrow(() => writeQuizState(blocked, state()))
  assert.equal(readQuizState({ ...blocked, getItem: () => '{bad JSON' }), null)

  const cyclic = state()
  Object.assign(cyclic, { cyclic })
  assert.doesNotThrow(() => writeQuizState(memoryStorage().storage, cyclic))
})

test('browser storage discovery handles SSR, access denial and usable localStorage', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  try {
    Reflect.deleteProperty(globalThis, 'window')
    assert.equal(getQuizStorage(), null)

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { get localStorage() { throw new DOMException('Blocked', 'SecurityError') } },
    })
    assert.equal(getQuizStorage(), null)

    const { storage } = memoryStorage()
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } })
    assert.equal(getQuizStorage(), storage)
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
