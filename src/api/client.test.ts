import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError, createQuizApi } from './client.ts'

const question = {
  id: 'c72b3aab-633f-4268-88e7-c6ba1c3bb217',
  text: 'Which currency is used in Japan?',
  options: ['Chinese yuan', 'Japanese yen', 'South Korean won', 'Thai baht'],
}

function apiWithResponse(body: unknown, init?: ResponseInit) {
  return createQuizApi({
    baseUrl: 'http://quiz.test',
    fetch: async () => Response.json(body, init),
  })
}

test('loads questions using the contract route and accepts an empty bank', async () => {
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

test('preserves HTTP 503 before parsing hosting error bodies', async () => {
  const bodies = [
    { body: '<!doctype html><title>Service unavailable</title>', contentType: 'text/html' },
    { body: 'Service unavailable', contentType: 'text/plain' },
    { body: JSON.stringify({ message: 'Service unavailable' }), contentType: 'application/json' },
    { body: '{malformed JSON', contentType: 'application/json' },
  ]

  for (const { body, contentType } of bodies) {
    const api = createQuizApi({
      baseUrl: 'http://quiz.test',
      fetch: async () => new Response(body, { status: 503, headers: { 'Content-Type': contentType } }),
    })
    await assert.rejects(api.loadQuestions(), (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, 503)
      assert.match(error.message, /service is having trouble/)
      assert.doesNotMatch(error.message, /Render|cold start|warming|unreadable/i)
      return true
    })
  }
})

test('preserves other HTTP statuses without inferring a cold start', async () => {
  const api = createQuizApi({
    baseUrl: 'http://quiz.test',
    fetch: async () => new Response('<!doctype html><title>Internal error</title>', {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    }),
  })
  await assert.rejects(api.loadQuestions(), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 500)
    assert.doesNotMatch(error.message, /Render|cold start|warming/i)
    return true
  })
})

test('rejects an HTTP failure without consuming a broken response body', async () => {
  const body = new ReadableStream({
    start(controller) { controller.error(new Error('Body stream failed')) },
  })
  const api = createQuizApi({
    baseUrl: 'http://quiz.test',
    fetch: async () => new Response(body, { status: 503 }),
  })
  await assert.rejects(api.loadQuestions(), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 503)
    return true
  })
})

test('passes the caller abort signal to the question request', async () => {
  const controller = new AbortController()
  const reason = new DOMException('Cancelled by caller', 'AbortError')
  const api = createQuizApi({
    baseUrl: 'http://quiz.test',
    fetch: async (input) => {
      assert.ok(input instanceof Request)
      assert.equal(input.signal.aborted, false)
      controller.abort(reason)
      assert.equal(input.signal.aborted, true)
      assert.equal(input.signal.reason, reason)
      throw input.signal.reason
    },
  })
  await assert.rejects(api.loadQuestions(controller.signal), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.cause, reason)
    return true
  })
})

test('allows 60 seconds for loading while answer checks retain their 15 second timeout', async (context) => {
  const deadlines: number[] = []
  context.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    deadlines.push(milliseconds)
    return new AbortController().signal
  })
  await apiWithResponse([question]).loadQuestions()
  await apiWithResponse({ correct: true }).submitAnswer(question.id, 'JPY')
  await apiWithResponse([question]).loadQuestions(new AbortController().signal)
  assert.deepEqual(deadlines, [60_000, 15_000])
})

test('does not automatically retry answer submissions on 503', async () => {
  let attempts = 0
  const api = createQuizApi({
    baseUrl: 'http://quiz.test',
    fetch: async () => {
      attempts++
      return new Response('Service unavailable', { status: 503 })
    },
  })
  await assert.rejects(api.submitAnswer(question.id, 'JPY'), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 503)
    return true
  })
  assert.equal(attempts, 1)
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
