import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { PublicQuestion } from '../../shared/generated/typescript/schema'
import { haveOptionsChanged, validateQuestionForm, type QuestionFormDraft } from './questionForm.ts'

const original: PublicQuestion = {
  id: '00000000-0000-0000-0000-000000000001',
  text: 'What currency does Japan use?',
  options: ['Japanese yen', 'Euro'],
}

function draft(overrides: Partial<QuestionFormDraft> = {}): QuestionFormDraft {
  return { text: original.text, options: [...original.options], correctAnswerIndex: null, ...overrides }
}

test('creates a trimmed question with exactly the selected correct answer', () => {
  assert.deepEqual(validateQuestionForm(draft({
    text: '  Which currency? \n', options: [' Japanese yen ', ' Euro '], correctAnswerIndex: 1,
  }), null).submission, {
    mode: 'create', body: { text: 'Which currency?', options: ['Japanese yen', 'Euro'], correctAnswer: 'Euro' },
  })
})

test('creates require an explicit answer rather than guessing the first option', () => {
  const result = validateQuestionForm(draft(), null)
  assert.equal(result.submission, null)
  assert.match(result.fieldErrors.correctAnswer!, /Select the correct answer/)
})

test('text-only edits preserve the unknown stored answer and omit unchanged options', () => {
  assert.deepEqual(validateQuestionForm(draft({ text: '  Which currency is used in Japan?  ' }), original).submission, {
    mode: 'edit', id: original.id, body: { text: 'Which currency is used in Japan?' },
  })
})

test('unchanged edits and whitespace-only changes produce no request', () => {
  for (const value of [draft(), draft({ text: ` ${original.text} `, options: [' Japanese yen ', ' Euro '] })]) {
    const result = validateQuestionForm(value, original)
    assert.equal(result.submission, null)
    assert.match(result.fieldErrors.form!, /No changes/)
  }
})

test('changing option text, case, count, or order requires a new answer selection', () => {
  for (const options of [
    ['Yen', 'Euro'], ['japanese yen', 'Euro'], ['Japanese yen', 'Euro', 'Dollar'], ['Euro', 'Japanese yen'],
  ]) {
    assert.equal(haveOptionsChanged(options, original), true)
    const result = validateQuestionForm(draft({ options }), original)
    assert.equal(result.submission, null)
    assert.match(result.fieldErrors.correctAnswer!, /options have changed/)
  }
})

test('option edits send the new options and their chosen answer without unchanged text', () => {
  assert.deepEqual(validateQuestionForm(draft({ options: ['Yen', 'Euro'], correctAnswerIndex: 0 }), original).submission, {
    mode: 'edit', id: original.id, body: { options: ['Yen', 'Euro'], correctAnswer: 'Yen' },
  })
})

test('an explicit answer-only edit omits question text and options', () => {
  assert.deepEqual(validateQuestionForm(draft({ correctAnswerIndex: 1 }), original).submission, {
    mode: 'edit', id: original.id, body: { correctAnswer: 'Euro' },
  })
})

test('rejects missing and whitespace-only fields without silently dropping empty options', () => {
  const result = validateQuestionForm(draft({ text: ' \n ', options: ['Yen', ' \n '], correctAnswerIndex: 0 }), null)
  assert.equal(result.submission, null)
  assert.ok(result.fieldErrors.text)
  assert.ok(result.fieldErrors.optionErrors[1])
})

test('duplicate options are checked after trimming and ignoring case, marking both rows', () => {
  const result = validateQuestionForm(draft({ options: [' Yen ', 'yEN'], correctAnswerIndex: 0 }), null)
  assert.equal(result.submission, null)
  assert.ok(result.fieldErrors.optionErrors[0])
  assert.ok(result.fieldErrors.optionErrors[1])
})

test('requires 2 to 10 options', () => {
  for (const options of [[], ['Yen'], Array.from({ length: 11 }, (_, i) => `Option ${i}`)]) {
    const result = validateQuestionForm(draft({ options, correctAnswerIndex: 0 }), null)
    assert.equal(result.submission, null)
    assert.ok(result.fieldErrors.options)
  }
  assert.ok(validateQuestionForm(draft({ options: Array.from({ length: 10 }, (_, i) => `Option ${i}`), correctAnswerIndex: 9 }), null).submission)
})

test('enforces text and option lengths in UTF-16 code units with inclusive boundaries', () => {
  assert.ok(validateQuestionForm(draft({ text: '😀'.repeat(250), options: ['😀'.repeat(100), 'Euro'], correctAnswerIndex: 0 }), null).submission)
  const longText = validateQuestionForm(draft({ text: `${'😀'.repeat(250)}x`, correctAnswerIndex: 0 }), null)
  assert.ok(longText.fieldErrors.text)
  const longOption = validateQuestionForm(draft({ options: [`${'😀'.repeat(100)}x`, 'Euro'], correctAnswerIndex: 0 }), null)
  assert.ok(longOption.fieldErrors.optionErrors[0])
  assert.equal(longOption.submission, null)
})

test('rejects stale, fractional, negative, and non-finite answer indices', () => {
  for (const correctAnswerIndex of [-1, 2, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = validateQuestionForm(draft({ correctAnswerIndex }), null)
    assert.equal(result.submission, null)
    assert.ok(result.fieldErrors.correctAnswer)
  }
})
