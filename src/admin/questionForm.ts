import type { CreateQuestionRequest, PublicQuestion, UpdateQuestionRequest } from '../../shared/generated/typescript/schema'

export type QuestionSubmission =
  | { mode: 'create'; body: CreateQuestionRequest }
  | { mode: 'edit'; id: string; body: UpdateQuestionRequest }

export interface QuestionFormDraft {
  text: string
  options: string[]
  correctAnswerIndex: number | null
}

export interface QuestionFormErrors {
  text?: string
  options?: string
  optionErrors: Record<number, string>
  correctAnswer?: string
  form?: string
}

export interface QuestionFormValidation {
  submission: QuestionSubmission | null
  fieldErrors: QuestionFormErrors
}

/** Compare the stored option order, spelling, and case after input whitespace is trimmed. */
export function haveOptionsChanged(options: readonly string[], original: PublicQuestion): boolean {
  return options.length !== original.options.length
    || options.some((option, index) => option.trim() !== original.options[index])
}

/** Keep validation and partial-update payloads independent of the editor's rendering. */
export function validateQuestionForm(draft: QuestionFormDraft, original: PublicQuestion | null): QuestionFormValidation {
  const text = draft.text.trim()
  const options = draft.options.map((option) => option.trim())
  const fieldErrors: QuestionFormErrors = { optionErrors: {} }

  if (text.length === 0 || text.length > 500) {
    fieldErrors.text = 'Enter a question of 1 to 500 characters after trimming.'
  }
  if (options.length < 2 || options.length > 10) {
    fieldErrors.options = 'Include between 2 and 10 answer options.'
  }

  const seen = new Map<string, number>()
  options.forEach((option, index) => {
    if (option.length === 0 || option.length > 200) {
      fieldErrors.optionErrors[index] = 'Enter an option of 1 to 200 characters after trimming.'
    }
    const key = option.toLowerCase()
    const previous = seen.get(key)
    if (option.length > 0 && previous !== undefined) {
      fieldErrors.optionErrors[index] = 'Each answer option must be different, including when compared without case.'
      fieldErrors.optionErrors[previous] = 'Each answer option must be different, including when compared without case.'
    } else {
      seen.set(key, index)
    }
  })

  const optionsChanged = original !== null && haveOptionsChanged(draft.options, original)
  let correctAnswer: string | undefined
  if (draft.correctAnswerIndex !== null) {
    if (Number.isInteger(draft.correctAnswerIndex) && draft.correctAnswerIndex >= 0) {
      correctAnswer = options[draft.correctAnswerIndex]
    }
    if (!correctAnswer) fieldErrors.correctAnswer = 'Select one of the answer options as correct.'
  } else if (original === null || optionsChanged) {
    fieldErrors.correctAnswer = optionsChanged
      ? 'The options have changed. Select the correct answer before saving.'
      : 'Select the correct answer before creating the question.'
  }

  const hasFieldErrors = fieldErrors.text !== undefined || fieldErrors.options !== undefined
    || fieldErrors.correctAnswer !== undefined || Object.keys(fieldErrors.optionErrors).length > 0
  if (hasFieldErrors) return { submission: null, fieldErrors }

  if (original === null) {
    // New questions always require a valid selected option above.
    if (correctAnswer === undefined) return { submission: null, fieldErrors }
    return { submission: { mode: 'create', body: { text, options, correctAnswer } }, fieldErrors }
  }

  const body: UpdateQuestionRequest = {}
  if (text !== original.text) body.text = text
  if (optionsChanged) body.options = options
  if (correctAnswer !== undefined) body.correctAnswer = correctAnswer
  if (Object.keys(body).length === 0) {
    fieldErrors.form = 'No changes yet. Edit the question, change an option, or choose a correct answer to save.'
    return { submission: null, fieldErrors }
  }
  return { submission: { mode: 'edit', id: original.id, body }, fieldErrors }
}
