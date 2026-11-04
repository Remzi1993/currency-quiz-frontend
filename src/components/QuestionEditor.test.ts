// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import QuestionEditor from './QuestionEditor.vue'

const question = {
  id: 'c72b3aab-633f-4268-88e7-c6ba1c3bb217',
  text: 'Which currency is used in Japan?',
  options: ['Japanese yen', 'Euro'],
}
const dialogPrototype = HTMLDialogElement.prototype
const originalShowModal = Object.getOwnPropertyDescriptor(dialogPrototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(dialogPrototype, 'close')
let wrapper: VueWrapper | undefined

beforeEach(() => {
  // jsdom does not implement modal dialogs. Keep form rendering and event handling real.
  Object.defineProperties(dialogPrototype, {
    showModal: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true }) },
    close: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false }) },
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
  if (originalShowModal) Object.defineProperty(dialogPrototype, 'showModal', originalShowModal)
  else Reflect.deleteProperty(dialogPrototype, 'showModal')
  if (originalClose) Object.defineProperty(dialogPrototype, 'close', originalClose)
  else Reflect.deleteProperty(dialogPrototype, 'close')
})

function renderEditor(editing = false) {
  wrapper = mount(QuestionEditor, {
    attachTo: document.body,
    props: { question: editing ? question : null, saving: false, error: '' },
  })
  return wrapper
}

test('invalid submission identifies the fields, describes the error and focuses the first invalid control', async () => {
  const editor = renderEditor()
  await editor.get('form').trigger('submit')

  expect(editor.emitted('save')).toBeUndefined()
  expect(editor.get('[role="alert"]').text()).toBe('Check the highlighted fields before saving.')
  const text = editor.get('textarea')
  expect(text.attributes('aria-invalid')).toBe('true')
  const describedBy = text.attributes('aria-describedby')!.split(' ')
  expect(document.getElementById(describedBy[1]!)?.textContent).toBe('Enter a question of 1 to 500 characters after trimming.')
  expect(document.activeElement).toBe(text.element)
  expect(editor.get('[aria-label="Mark option 1 as the correct answer"]').attributes('aria-invalid')).toBe('true')
})

test('a valid form emits the trimmed question and explicitly selected correct answer', async () => {
  const editor = renderEditor()
  await editor.get('textarea').setValue('  Which currency is used in Japan?  ')
  await editor.get('input[placeholder="Japanese yen"]').setValue(' Japanese yen ')
  await editor.get('input[placeholder="Euro"]').setValue(' Euro ')
  await editor.get('[aria-label="Mark option 2 as the correct answer"]').setValue(true)
  await editor.get('form').trigger('submit')

  expect(editor.emitted('save')).toEqual([[{
    mode: 'create',
    body: { text: question.text, options: question.options, correctAnswer: 'Euro' },
  }]])
  expect(editor.find('[role="alert"]').exists()).toBe(false)
})

test('editing only the text retains the hidden answer and emits a partial update', async () => {
  const editor = renderEditor(true)
  expect(editor.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  await editor.get('textarea').setValue('What is the Japanese currency?')
  await editor.get('form').trigger('submit')

  expect(editor.emitted('save')).toEqual([[{
    mode: 'edit', id: question.id, body: { text: 'What is the Japanese currency?' },
  }]])
})

test('changing options requires a new answer selection before the editor can save', async () => {
  const editor = renderEditor(true)
  await editor.get('input[placeholder="Japanese yen"]').setValue('Yen')
  await editor.get('form').trigger('submit')
  expect(editor.emitted('save')).toBeUndefined()
  expect(editor.text()).toContain('The options have changed. Select the correct answer before saving.')

  await editor.get('[aria-label="Mark option 1 as the correct answer"]').setValue(true)
  await editor.get('form').trigger('submit')
  expect(editor.emitted('save')).toEqual([[{
    mode: 'edit', id: question.id, body: { options: ['Yen', 'Euro'], correctAnswer: 'Yen' },
  }]])
})

test('adding and removing an option preserves selection and moves focus to the remaining option', async () => {
  const editor = renderEditor()
  await editor.get('textarea').setValue(question.text)
  await editor.get('input[placeholder="Japanese yen"]').setValue('Japanese yen')
  await editor.get('input[placeholder="Euro"]').setValue('Euro')
  const add = editor.findAll('button').find((button) => button.text() === 'Add option')!
  await add.trigger('click')
  const thirdOption = editor.get('input[placeholder="Another answer option"]')
  expect(document.activeElement).toBe(thirdOption.element)
  await thirdOption.setValue('US dollar')
  await editor.get('[aria-label="Mark option 3 as the correct answer"]').setValue(true)
  await editor.get('[aria-label="Remove option 1"]').trigger('click')

  expect(document.activeElement).toBe(editor.get('input[placeholder="Japanese yen"]').element)
  expect((editor.get('[aria-label="Mark option 2 as the correct answer"]').element as HTMLInputElement).checked).toBe(true)
  await editor.get('form').trigger('submit')
  expect(editor.emitted('save')).toEqual([[{
    mode: 'create', body: { text: question.text, options: ['Euro', 'US dollar'], correctAnswer: 'US dollar' },
  }]])
})

test('saving disables the form, blocks dismissal and displays the server error accessibly', async () => {
  const editor = renderEditor(true)
  await editor.setProps({ saving: true, error: 'The question could not be saved. Try again.' })
  expect(editor.get('dialog').attributes('aria-busy')).toBe('true')
  expect(editor.get('textarea').element.matches(':disabled')).toBe(true)
  expect(editor.get('[role="alert"]').text()).toBe('The question could not be saved. Try again.')
  await editor.get('dialog').trigger('cancel')
  await editor.get('form').trigger('submit')
  expect(editor.emitted('close')).toBeUndefined()
  expect(editor.emitted('save')).toBeUndefined()

  await editor.setProps({ saving: false })
  await editor.get('[aria-label="Close question editor"]').trigger('click')
  expect(editor.emitted('close')).toHaveLength(1)
})

test('unmounting closes the dialog and restores focus to the control that opened it', () => {
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  const editor = renderEditor()
  const dialog = editor.get('dialog').element
  expect(dialog.open).toBe(true)
  editor.get('textarea').element.focus()
  editor.unmount()
  wrapper = undefined

  expect(dialog.open).toBe(false)
  expect(document.activeElement).toBe(opener)
})
