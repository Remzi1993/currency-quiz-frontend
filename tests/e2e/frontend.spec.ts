import type { Page } from '@playwright/test'
import { test, expect } from './fixtures.ts'
import { seedQuestions, testCredentials } from './seed.ts'

async function chooseCorrectAnswer(page: Page) {
  // Read the visible question instead of depending on the app's random shuffle order.
  await expect(page.getByRole('group', { name: /^Which currency is used/ })).toBeVisible()
  for (const candidate of seedQuestions) {
    if (await page.getByRole('group', { name: candidate.text, exact: true }).isVisible()) {
      // The native radio is visually clipped; users click its visible label.
      await page.getByRole('group', { name: candidate.text, exact: true })
        .getByText(candidate.correctAnswer, { exact: true }).click()
      await expect(page.getByRole('radio', { name: new RegExp(candidate.correctAnswer) })).toBeChecked()
      return
    }
  }
  throw new Error('The visible question does not belong to this test fixture.')
}

test('completes a shuffled quiz and restores checked answers and results after reload', async ({ page, testApi }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Let’s play' }).click()
  for (let index = 0; index < seedQuestions.length; index++) {
    await expect(page.getByRole('progressbar', { name: `${index} of 3 questions answered` })).toBeVisible()
    await chooseCorrectAnswer(page)
    await page.getByRole('button', { name: 'Check my answer' }).click()
    await expect(page.getByRole('status')).toContainText('Right on the money!')
    if (index === 0) {
      await page.reload()
      await expect(page.getByRole('status')).toContainText('Right on the money!')
      expect((await testApi.state()).answers).toHaveLength(1)
      expect((await testApi.state()).listReads).toBe(1)
    }
    await page.getByRole('button', { name: index === 2 ? 'See my results' : 'Next question' }).click()
  }
  await expect(page.getByRole('heading', { name: 'A world-class round.' })).toBeVisible()
  await expect(page.getByText('3 correct', { exact: true })).toBeVisible()
  await page.getByText('Your round, in review').click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Your answer:' })).toHaveCount(3)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'A world-class round.' })).toBeVisible()
  expect((await testApi.state()).answers).toHaveLength(3)
  expect((await testApi.state()).listReads).toBe(1)
  await page.getByRole('button', { name: 'Play another round' }).click()
  await expect(page.getByRole('button', { name: 'Let’s play' })).toBeVisible()
})

test('disables submit and answer choices while an HTTP answer is pending', async ({ page, testApi }) => {
  await testApi.configure({ holdAnswers: true })
  await page.goto('/')
  await page.getByRole('button', { name: 'Let’s play' }).click()
  await chooseCorrectAnswer(page)
  await page.getByRole('button', { name: 'Check my answer' }).click()
  await expect.poll(async () => (await testApi.state()).answers.length).toBe(1)
  await expect(page.getByRole('button', { name: 'Check my answer' })).toBeDisabled()
  for (const radio of await page.getByRole('radio').all()) await expect(radio).toBeDisabled()
  await testApi.configure({ holdAnswers: false })
  await expect(page.getByRole('status')).toContainText('Right on the money!')
  expect((await testApi.state()).answers).toHaveLength(1)
})

test('shows an HTTP loading failure and recovers only after a manual retry', async ({ page, testApi }) => {
  await testApi.configure({ failNextList: true })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'We couldn’t load the quiz.' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('The quiz service is having trouble.')
  expect((await testApi.state()).listReads).toBe(1)
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Let’s play' })).toBeVisible()
  expect((await testApi.state()).listReads).toBe(2)
})

test('honours Retry-After without automatically repeating an answer submission', async ({ page, testApi }) => {
  // Keep Date fixed while ordinary browser timers and rendering continue to run.
  // A slow CI machine cannot consume the countdown before the disabled-state assertion.
  const now = new Date('2026-01-01T12:00:00Z')
  await page.clock.setFixedTime(now)
  await testApi.configure({ rateLimitNextAnswer: true })
  await page.goto('/')
  await page.getByRole('button', { name: 'Let’s play' }).click()
  await chooseCorrectAnswer(page)
  await page.getByRole('button', { name: 'Check my answer' }).click()
  await expect(page.getByRole('alert')).toContainText('A short pause')
  await expect(page.getByRole('button', { name: /^Try again in/ })).toBeDisabled()
  expect((await testApi.state()).answers).toHaveLength(1)
  await page.clock.setFixedTime(new Date(now.getTime() + 2_000))
  await expect(page.getByRole('button', { name: 'Try my answer again' })).toBeEnabled()
  expect((await testApi.state()).answers).toHaveLength(1)
  await page.getByRole('button', { name: 'Try my answer again' }).click()
  await expect(page.getByRole('status')).toContainText('Right on the money!')
  expect((await testApi.state()).answers).toHaveLength(2)
})

test('protects admin routes and renews both cookies before creating, editing, deleting and signing out', async ({ page, context, testApi }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login$/)
  await page.getByRole('textbox', { name: 'Username' }).fill(testCredentials.username)
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('The username or password is incorrect.')
  await page.getByLabel('Password', { exact: true }).fill(testCredentials.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('status').filter({ hasText: 'Showing' })).toHaveText('Showing 3 of 3 questions')
  const originalCookies = await context.cookies()
  await testApi.configure({ expireAccess: true })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Create question', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Create question', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Create a question' })
  await editor.getByRole('textbox', { name: 'Question', exact: true }).fill('Which currency is used in Switzerland?')
  await editor.getByRole('textbox', { name: 'Option 1', exact: true }).fill('Swiss franc')
  await editor.getByRole('textbox', { name: 'Option 2', exact: true }).fill('Euro')
  await editor.getByRole('radio', { name: 'Mark option 1 as the correct answer' }).check()
  await editor.getByRole('button', { name: 'Create question', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Question created.' })).toBeVisible()
  expect((await testApi.state()).refreshes).toBe(1)
  const renewedCookies = await context.cookies()
  for (const name of ['currency_quiz_admin', 'currency_quiz_admin_refresh']) {
    const original = originalCookies.find((cookie) => cookie.name === name)
    const renewed = renewedCookies.find((cookie) => cookie.name === name)
    expect(original).toBeDefined()
    expect(renewed?.httpOnly).toBe(true)
    expect(renewed?.value).not.toBe(original?.value)
  }
  await page.getByRole('searchbox', { name: 'Search questions' }).fill('Switzerland')
  await expect(page.getByRole('row').filter({ hasText: 'Which currency is used in Switzerland?' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Edit question: Which currency is used in Switzerland?' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit question', exact: true })
  await edit.getByRole('textbox', { name: 'Question', exact: true }).fill('What is the currency of Switzerland?')
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Question updated.' })).toBeVisible()
  await page.getByRole('button', { name: 'Delete question: What is the currency of Switzerland?' }).click()
  const deletion = page.getByRole('dialog', { name: 'Delete this question?' })
  await deletion.getByRole('button', { name: 'Delete question', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Question deleted.' })).toBeVisible()
  const state = await testApi.state()
  expect(state.questionCount).toBe(3)
  expect(state.mutations).toEqual([
    { method: 'POST', body: { text: 'Which currency is used in Switzerland?', options: ['Swiss franc', 'Euro'], correctAnswer: 'Swiss franc' } },
    { method: 'PATCH', body: { text: 'What is the currency of Switzerland?' } },
    { method: 'DELETE', body: null },
  ])
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/admin\/login\?reason=signed-out$/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login$/)
})

test('expired refresh requires sign-in again instead of background renewal', async ({ page, testApi }) => {
  await page.goto('/admin/login')
  await page.getByRole('textbox', { name: 'Username' }).fill(testCredentials.username)
  await page.getByLabel('Password', { exact: true }).fill(testCredentials.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await testApi.configure({ expireAccess: true, expireRefresh: true })
  await page.reload()
  await expect(page).toHaveURL(/\/admin\/login$/)
  expect((await testApi.state()).refreshes).toBe(0)
})
