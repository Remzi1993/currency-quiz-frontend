import { isQuestion, type Question } from '../api/client.ts'

export const QUIZ_STORAGE_KEY = 'currency-quiz.state.v1'

export type QuizStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface StoredAnswerRecord {
  question: Question
  answer: string
  correct: boolean
}

export interface StoredQuizSession {
  phase: 'playing' | 'results'
  questions: Question[]
  sessionQuestions: Question[]
  questionIndex: number
  selectedAnswer: string | null
  records: StoredAnswerRecord[]
  retryAt: number | null
  correctCount: number
  incorrectCount: number
  error: string | null
}

export interface StoredQuizState {
  version: 1
  questionCount: number
  session: StoredQuizSession | null
}

function hasFields(value: unknown, fields: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field))
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isQuestionList(value: unknown): value is Question[] {
  return Array.isArray(value) && value.length > 0 && value.every(isQuestion)
    && new Set(value.map(({ id }) => id.toLowerCase())).size === value.length
}

function sameQuestion(first: Question, second: Question): boolean {
  return first.id === second.id && first.text === second.text
    && first.options.length === second.options.length
    && first.options.every((option, index) => option === second.options[index])
}

function isSession(value: unknown): value is StoredQuizSession {
  if (!hasFields(value, [
    'phase', 'questions', 'sessionQuestions', 'questionIndex', 'selectedAnswer',
    'records', 'retryAt', 'correctCount', 'incorrectCount', 'error',
  ])) return false

  const { phase, questions, sessionQuestions, questionIndex, selectedAnswer, records, retryAt, correctCount, incorrectCount, error } = value
  if ((phase !== 'playing' && phase !== 'results')
    || !isQuestionList(questions) || !isQuestionList(sessionQuestions)
    || sessionQuestions.length > questions.length
    || !isNonnegativeInteger(questionIndex) || questionIndex >= sessionQuestions.length
    || !Array.isArray(records) || records.length > sessionQuestions.length
    || !(retryAt === null || isNonnegativeInteger(retryAt))
    || !isNonnegativeInteger(correctCount) || !isNonnegativeInteger(incorrectCount)
    || !(error === null || typeof error === 'string')) return false

  const questionBank = new Map(questions.map((question) => [question.id, question]))
  if (!sessionQuestions.every((question) => {
    const original = questionBank.get(question.id)
    return original !== undefined && sameQuestion(question, original)
  })) return false

  const currentQuestion = sessionQuestions[questionIndex]!
  if (!(selectedAnswer === null || (typeof selectedAnswer === 'string' && currentQuestion.options.includes(selectedAnswer)))) return false

  let correct = 0
  for (let index = 0; index < records.length; index++) {
    const record: unknown = records[index]
    if (!hasFields(record, ['question', 'answer', 'correct']) || !isQuestion(record.question)
      || typeof record.answer !== 'string' || typeof record.correct !== 'boolean'
      || !sameQuestion(record.question, sessionQuestions[index]!)
      || !record.question.options.includes(record.answer)) return false
    if (record.correct) correct++
  }
  if (correctCount !== correct || incorrectCount !== records.length - correct) return false

  if (phase === 'results' && (questionIndex !== sessionQuestions.length - 1 || records.length !== sessionQuestions.length)) return false
  if (records.length !== questionIndex && records.length !== questionIndex + 1) return false
  if (records.length === questionIndex + 1) {
    const currentRecord = records[questionIndex] as StoredAnswerRecord
    if (selectedAnswer !== currentRecord.answer || retryAt !== null || error !== null) return false
  }
  return true
}

function isState(value: unknown): value is StoredQuizState {
  return hasFields(value, ['version', 'questionCount', 'session'])
    && value.version === 1 && isNonnegativeInteger(value.questionCount) && value.questionCount > 0
    && (value.session === null || (isSession(value.session)
      && value.session.sessionQuestions.length === Math.min(value.questionCount, value.session.questions.length)))
}

function discardState(storage: QuizStorage): void {
  try { storage.removeItem(QUIZ_STORAGE_KEY) } catch { /* Storage can be disabled between reads. */ }
}

/** Storage is optional: private browsing, SSR and browser policies must not stop a quiz. */
export function getQuizStorage(): QuizStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage ?? null } catch { return null }
}

export function readQuizState(storage: QuizStorage | null): StoredQuizState | null {
  if (storage === null) return null
  let encoded: string | null
  try { encoded = storage.getItem(QUIZ_STORAGE_KEY) } catch { return null }
  if (encoded === null) return null
  try {
    const state: unknown = JSON.parse(encoded)
    if (isState(state)) return state
  } catch { /* Invalid or older data is discarded below. */ }
  discardState(storage)
  return null
}

export function writeQuizState(storage: QuizStorage | null, state: StoredQuizState): void {
  if (storage === null) return
  try { storage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(state)) } catch { /* Quota or policy errors leave the current quiz usable. */ }
}
