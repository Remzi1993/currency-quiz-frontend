import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError, createQuizApi } from './client.ts'

const question = {
  id: '58d6497e-227a-4bc4-938e-159f449df87e',
  text: 'Which currency is used in Japan?',
  options: ['USD', 'EUR', 'JPY', 'GBP'],
}

function apiWithResponse(body: unknown, init?: ResponseInit) {
  return createQuizApi({
    baseUrl: 'http://quiz.test',
    fetch: async () => Response.json(body, init),
  })
}

test('loads public questions using the contract route and accepts an empty bank', async () => {
  const api = createQuizApi({
    baseUrl: 'http://quiz.test/',
    fetch: async (input) => {
      assert.ok(input instanceof Request)
      assert.equal(input.url, 'http://quiz.test/api/v1/questions')
      assert.equal(input.method, 'GET')
      assert.equal(input.headers.get('Accept'), 'application/json')
      return Response.json([question])
    },
  })
  assert.deepEqual(await api.loadQuestions(), [question])
  assert.deepEqual(await apiWithResponse([]).loadQuestions(), [])
})

test('submits the selected answer to the server and preserves an incorrect 200 result', async () => {
  const api = createQuizApi({
    baseUrl: 'http://quiz.test',
    fetch: async (input) => {
      assert.ok(input instanceof Request)
      assert.equal(input.url, `http://quiz.test/api/v1/questions/${question.id}/answers`)
      assert.equal(input.method, 'POST')
      assert.equal(input.headers.get('Content-Type'), 'application/json')
      assert.deepEqual(await input.json(), { answer: 'USD' })
      return Response.json({ correct: false })
    },
  })
  assert.deepEqual(await api.submitAnswer(question.id, 'USD'), { correct: false })
  assert.deepEqual(await apiWithResponse({ correct: true }).submitAnswer(question.id, 'JPY'), { correct: true })
})

test('rejects malformed question banks before rendering untrusted values', async () => {
  for (const payload of [
    {},
    [null],
    [{ ...question, id: 'not-a-uuid' }],
    [{ ...question, text: '' }],
    [{ ...question, options: ['USD'] }],
    [{ ...question, options: ['USD', null] }],
    [{ ...question, options: ['USD', ' usd '] }],
    [{ ...question, correctAnswer: 'JPY' }],
    [{ ...question, extraField: 'unexpected' }],
    [question, question],
  ]) {
    await assert.rejects(apiWithResponse(payload).loadQuestions(), (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.match(error.message, /invalid questions/)
      return true
    })
  }
})

test('rejects missing, non-boolean or extra answer result fields', async () => {
  for (const payload of [null, {}, { correct: 'false' }, { correct: false, correctAnswer: 'JPY' }]) {
    await assert.rejects(apiWithResponse(payload).submitAnswer(question.id, 'USD'), /invalid answer result/)
  }
})

test('explains that missing questions require reloading the question bank', async () => {
  await assert.rejects(
    apiWithResponse({ code: 'not_found', message: 'Question not found', details: [] }, { status: 404 })
      .submitAnswer(question.id, 'JPY'),
    /Reload the questions to get the latest quiz/,
  )
})

test('preserves 429 status and Retry-After seconds for retry handling', async () => {
  const api = apiWithResponse({ code: 'rate_limited', message: 'Slow down', details: [] }, {
    status: 429,
    headers: { 'Retry-After': '23' },
  })
  await assert.rejects(api.submitAnswer(question.id, 'JPY'), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 429)
    assert.equal(error.retryAfter, 23)
    assert.match(error.message, /23 seconds/)
    return true
  })
})

test('uses safe fallback messages for server errors and invalid retry headers', async () => {
  await assert.rejects(
    apiWithResponse({ message: 'internal database details' }, { status: 500 }).loadQuestions(),
    (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, 500)
      assert.doesNotMatch(error.message, /database/)
      return true
    },
  )
  await assert.rejects(
    apiWithResponse({}, { status: 429, headers: { 'Retry-After': 'invalid' } }).loadQuestions(),
    (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.retryAfter, undefined)
      return true
    },
  )
})

test('reports network, timeout and invalid JSON failures as recoverable API errors', async () => {
  for (const [failure, message] of [
    [new TypeError('Failed to fetch'), /could not reach/],
    [new DOMException('Timed out', 'TimeoutError'), /took too long/],
    [new SyntaxError('Unexpected token'), /unreadable response/],
  ] as const) {
    const api = createQuizApi({
      baseUrl: 'http://quiz.test',
      fetch: async () => { throw failure },
    })
    await assert.rejects(api.loadQuestions(), (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.match(error.message, message)
      return true
    })
  }
})
