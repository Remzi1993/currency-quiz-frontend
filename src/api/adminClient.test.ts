import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from './client.ts'
import { createAdminApi, type AdminApi, type CreateQuestionRequest } from './adminClient.ts'

const question = {
  id: 'c72b3aab-633f-4268-88e7-c6ba1c3bb217',
  text: 'Which currency is used in Japan?',
  options: ['Chinese yuan', 'Japanese yen', 'South Korean won', 'Thai baht'],
}
const adminQuestion = { ...question, correctAnswer: 'Japanese yen' }
const tokenResponse = { accessToken: 'example-test-token', tokenType: 'Bearer', expiresIn: 3600 }
const credentials = { username: 'example-admin', password: 'example-only-password' }
const createBody: CreateQuestionRequest = { text: question.text, options: question.options, correctAnswer: 'Japanese yen' }

function withResponse(body: unknown, init?: ResponseInit): AdminApi {
  return createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => Response.json(body, init) })
}

test('sends all admin operations to contract routes with explicit bodies and bearer headers', async () => {
  const calls: Request[] = []
  const api = createAdminApi({
    baseUrl: '  https://quiz.test/backend///  ',
    fetch: async (input) => {
      assert.ok(input instanceof Request)
      calls.push(input)
      assert.equal(input.credentials, 'omit')
      assert.equal(input.headers.get('Accept'), 'application/json')
      if (input.url.endsWith('/auth/login')) return Response.json(tokenResponse)
      if (input.method === 'GET') return Response.json([question])
      if (input.method === 'DELETE') return new Response(null, { status: 204 })
      return Response.json(adminQuestion, { status: input.method === 'POST' ? 201 : 200 })
    },
  })
  assert.deepEqual(await api.login(credentials), tokenResponse)
  assert.deepEqual(await api.listQuestions(tokenResponse.accessToken), [question])
  assert.deepEqual(await api.createQuestion(tokenResponse.accessToken, createBody), adminQuestion)
  assert.deepEqual(await api.updateQuestion(tokenResponse.accessToken, 'id/with ?#', { text: 'Updated question?' }), adminQuestion)
  assert.equal(await api.deleteQuestion(tokenResponse.accessToken, 'id/with ?#'), undefined)

  assert.deepEqual(calls.map(({ method, url }) => [method, url]), [
    ['POST', 'https://quiz.test/backend/api/v1/auth/login'],
    ['GET', 'https://quiz.test/backend/api/v1/questions'],
    ['POST', 'https://quiz.test/backend/api/v1/questions'],
    ['PATCH', 'https://quiz.test/backend/api/v1/questions/id%2Fwith%20%3F%23'],
    ['DELETE', 'https://quiz.test/backend/api/v1/questions/id%2Fwith%20%3F%23'],
  ])
  assert.equal(calls[0]!.headers.get('Authorization'), null)
  assert.deepEqual(await calls[0]!.json(), credentials)
  assert.deepEqual(await calls[2]!.json(), createBody)
  assert.deepEqual(await calls[3]!.json(), { text: 'Updated question?' })
  for (const [index, call] of calls.entries()) {
    assert.equal(call.headers.get('Authorization'), index === 0 ? null : 'Bearer example-test-token')
    assert.equal(call.headers.get('Content-Type'), ['POST', 'PATCH'].includes(call.method) ? 'application/json' : null)
    if (call.method === 'GET' || call.method === 'DELETE') assert.equal(call.body, null)
  }
})

test('DELETE 204 never reads the empty response body', async () => {
  const response = new Response(null, { status: 204 })
  response.json = async () => assert.fail('DELETE 204 must not parse JSON')
  response.text = async () => assert.fail('DELETE 204 must not read a body')
  const api = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => response })
  await api.deleteQuestion('example-token', question.id)
  await assert.rejects(withResponse({}, { status: 200 }).deleteQuestion('example-token', question.id), /unexpected deletion response/)
})

test('validates closed token responses and documented bearer lifetime bounds', async () => {
  for (const payload of [
    null, {}, { ...tokenResponse, accessToken: '' }, { ...tokenResponse, accessToken: '  ' },
    { ...tokenResponse, accessToken: ' padded ' }, { ...tokenResponse, tokenType: 'Basic' },
    { ...tokenResponse, expiresIn: 0 }, { ...tokenResponse, expiresIn: 86_401 },
    { ...tokenResponse, expiresIn: 1.5 }, { ...tokenResponse, expiresIn: '3600' },
    { ...tokenResponse, extra: true },
  ]) {
    await assert.rejects(withResponse(payload).login(credentials), /invalid login response/)
  }
  for (const expiresIn of [1, 86_400]) {
    const payload = { ...tokenResponse, expiresIn }
    assert.deepEqual(await withResponse(payload).login(credentials), payload)
  }
})

test('validates public lists and admin responses without confusing public and private shapes', async () => {
  assert.deepEqual(await withResponse([]).listQuestions('example-token'), [])
  for (const payload of [[adminQuestion], [question, question], [null], {}]) {
    await assert.rejects(withResponse(payload).listQuestions('example-token'), /invalid question list/)
  }
  for (const payload of [
    question, null, { ...adminQuestion, correctAnswer: 'Not an option' },
    { ...adminQuestion, correctAnswer: '' }, { ...adminQuestion, options: ['JPY'] },
    { ...adminQuestion, options: ['JPY', 'jpy'] }, { ...adminQuestion, extra: true },
  ]) {
    await assert.rejects(withResponse(payload, { status: 201 }).createQuestion('example-token', createBody), /invalid saved question/)
    await assert.rejects(withResponse(payload).updateQuestion('example-token', question.id, { text: 'Updated?' }), /invalid saved question/)
  }
  const caseInsensitive = { ...adminQuestion, correctAnswer: 'japanese YEN' }
  assert.deepEqual(await withResponse(caseInsensitive, { status: 201 }).createQuestion('example-token', createBody), caseInsensitive)
})

test('preserves login 401 and masks credentials or internal server messages', async () => {
  for (const [status, message] of [[401, /username or password is incorrect/], [500, /service is having trouble/]] as const) {
    const api = withResponse({ code: 'internal_error', message: credentials.password, details: ['database secret'] }, { status })
    await assert.rejects(api.login(credentials), (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, status)
      assert.match(error.message, message)
      assert.doesNotMatch(error.message, /example-only-password|database secret|Render/)
      return true
    })
  }
  await assert.rejects(withResponse({}, { status: 401 }).updateQuestion('expired-token', question.id, { text: 'Updated?' }), /sign in again/)
})

test('uses bounded validation details only from recognized 400 API errors', async () => {
  await assert.rejects(withResponse({
    code: 'validation_error', message: 'Request validation failed', details: ['Text is required.', 'Options must be unique.'],
  }, { status: 400 }).createQuestion('example-token', createBody), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 400)
    assert.match(error.message, /Text is required\. Options must be unique\./)
    return true
  })
  await assert.rejects(withResponse({ code: 'validation_error', message: 'Validation failed', details: Array.from({ length: 20 }, () => 'x'.repeat(500)) }, { status: 400 }).createQuestion('example-token', createBody), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.ok(error.message.length < 1100)
    return true
  })
  for (const body of ['<html>secret stack trace</html>', JSON.stringify({ code: 'unknown', message: 'secret stack trace', details: ['secret stack trace'] })]) {
    const api = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => new Response(body, { status: 400 }) })
    await assert.rejects(api.createQuestion('example-token', createBody), (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, 400)
      assert.doesNotMatch(error.message, /secret stack trace/)
      return true
    })
  }
})

test('preserves HTTP status for HTML, malformed JSON and broken error bodies', async () => {
  for (const status of [401, 503]) {
    for (const body of ['<html>Service unavailable</html>', 'Plain text failure', '{invalid JSON']) {
      const api = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => new Response(body, { status }) })
      await assert.rejects(api.login(credentials), (error: unknown) => {
        assert.ok(error instanceof ApiError)
        assert.equal(error.status, status)
        assert.equal(error.message.includes('Render'), status === 503)
        return true
      })
    }
  }
  for (const status of [400, 503]) {
    const body = new ReadableStream({ start(controller) { controller.error(new Error('Body failed')) } })
    const api = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => new Response(body, { status }) })
    await assert.rejects(api.login(credentials), (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, status)
      return true
    })
  }
})

test('preserves rate-limit Retry-After seconds and does not automatically retry writes', async () => {
  const methods: Array<(api: AdminApi) => Promise<unknown>> = [
    (api) => api.login(credentials),
    (api) => api.createQuestion('example-token', createBody),
    (api) => api.updateQuestion('example-token', question.id, { text: 'Updated?' }),
    (api) => api.deleteQuestion('example-token', question.id),
  ]
  for (const method of methods) {
    let calls = 0
    const api = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => {
      calls++
      return new Response('Rate limited', { status: 429, headers: { 'Retry-After': '42' } })
    } })
    await assert.rejects(method(api), (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, 429)
      assert.equal(error.retryAfter, 42)
      assert.match(error.message, /42 seconds/)
      return true
    })
    assert.equal(calls, 1)
  }
})

test('combines caller cancellation with bounded login/read and mutation timeouts', async (context) => {
  const deadlines: number[] = []
  const timeoutControllers: AbortController[] = []
  context.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    deadlines.push(milliseconds)
    const controller = new AbortController()
    timeoutControllers.push(controller)
    return controller.signal
  })
  const methods: Array<(api: AdminApi, signal: AbortSignal) => Promise<unknown>> = [
    (api, signal) => api.login(credentials, signal),
    (api, signal) => api.listQuestions('example-token', signal),
    (api, signal) => api.createQuestion('example-token', createBody, signal),
    (api, signal) => api.updateQuestion('example-token', question.id, { text: 'Updated?' }, signal),
    (api, signal) => api.deleteQuestion('example-token', question.id, signal),
  ]
  for (const method of methods) {
    const caller = new AbortController()
    const reason = new DOMException('Cancelled', 'AbortError')
    const api = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async (input) => {
      assert.ok(input instanceof Request)
      caller.abort(reason)
      assert.equal(input.signal.aborted, true)
      assert.equal(input.signal.reason, reason)
      throw input.signal.reason
    } })
    await assert.rejects(method(api, caller.signal), (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.cause, reason)
      return true
    })
  }
  assert.deepEqual(deadlines, [60_000, 60_000, 15_000, 15_000, 15_000])

  const reason = new DOMException('Timed out', 'TimeoutError')
  const api = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async (input) => {
    assert.ok(input instanceof Request)
    timeoutControllers.at(-1)!.abort(reason)
    assert.equal(input.signal.reason, reason)
    throw input.signal.reason
  } })
  await assert.rejects(api.login(credentials, new AbortController().signal), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.cause, reason)
    assert.match(error.message, /too long/)
    assert.doesNotMatch(error.message, /Render/)
    return true
  })
})

test('wraps successful malformed JSON and connection errors without claiming a Render wake-up', async () => {
  const malformed = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => new Response('{invalid JSON') })
  await assert.rejects(malformed.login(credentials), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.ok(error.cause instanceof SyntaxError)
    assert.match(error.message, /unreadable response/)
    assert.doesNotMatch(error.message, /Render/)
    return true
  })
  const failure = new TypeError('Failed to fetch')
  const disconnected = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => { throw failure } })
  await assert.rejects(disconnected.login(credentials), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.cause, failure)
    assert.match(error.message, /could not reach/)
    assert.doesNotMatch(error.message, /Render/)
    return true
  })
})
