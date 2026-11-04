import { expect, test } from 'vitest'
import type { PublicQuestion } from '../../shared/generated/typescript/schema'
import { validateQuestionForm } from './questionForm.ts'

const original: PublicQuestion = {
  id: '00000000-0000-0000-0000-000000000001',
  text: 'What currency does Japan use?',
  options: ['Japanese yen', 'Euro', 'US dollar'],
}

test('removing the last option requires selecting the answer even when the remaining options are unchanged', () => {
  const result = validateQuestionForm({
    text: original.text, options: ['Japanese yen', 'Euro'], correctAnswerIndex: null,
  }, original)

  expect(result.submission).toBeNull()
  expect(result.fieldErrors.correctAnswer).toBe('The options have changed. Select the correct answer before saving.')
  expect(result.fieldErrors.form).toBeUndefined()
})

test('removing the last option sends the shorter option list along with its selected answer', () => {
  const result = validateQuestionForm({
    text: original.text, options: ['Japanese yen', 'Euro'], correctAnswerIndex: 0,
  }, original)

  expect(result.submission).toEqual({
    mode: 'edit', id: original.id,
    body: { options: ['Japanese yen', 'Euro'], correctAnswer: 'Japanese yen' },
  })
})

test.each([
  { mode: 'create', original: null, boundary: 'blank', text: ' \n ' },
  { mode: 'create', original: null, boundary: 'over 500 characters', text: 'x'.repeat(501) },
  { mode: 'edit', original, boundary: 'blank', text: ' \n ' },
  { mode: 'edit', original, boundary: 'over 500 characters', text: 'x'.repeat(501) },
])('$mode rejects $boundary question text when the options and answer are valid', ({ original: savedQuestion, text }) => {
  const result = validateQuestionForm({
    text, options: [...original.options], correctAnswerIndex: 0,
  }, savedQuestion)

  expect(result.submission).toBeNull()
  expect(result.fieldErrors).toEqual({
    text: 'Enter a question of 1 to 500 characters after trimming.', optionErrors: {},
  })
})
