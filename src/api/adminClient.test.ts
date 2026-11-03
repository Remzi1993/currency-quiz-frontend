import assert from 'node:assert/strict'
import { test, afterEach, vi } from 'vitest'
import { ApiError } from './client.ts'
import { createAdminApi, type AdminApi, type CreateQuestionRequest } from './adminClient.ts'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const question = { id: 'c72b3aab-633f-4268-88e7-c6ba1c3bb217', text: 'Which currency is used in Japan?', options: ['Chinese yuan', 'Japanese yen', 'South Korean won', 'Thai baht'] }
const adminQuestion = { ...question, correctAnswer: 'Japanese yen' }
const csrfToken = 'a'.repeat(43)
const sessionResponse = { username: 'example-admin', csrfToken, expiresIn: 900, accessExpiresIn: 300, absoluteExpiresIn: 1800 }
const credentials = { username: 'example-admin', password: 'example-only-password' }
const createBody: CreateQuestionRequest = { text: question.text, options: question.options, correctAnswer: 'Japanese yen' }
function withResponse(body: unknown, init?: ResponseInit): AdminApi {
  return createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => Response.json(body, init) })
}

test('browser operations use cookies, no Authorization, no cache, and CSRF only on authenticated writes', async () => {
  const calls: Request[] = []
  const api = createAdminApi({ baseUrl: '  https://quiz.test/backend///  ', fetch: async (input) => {
    assert.ok(input instanceof Request)
    calls.push(input)
    assert.equal(input.credentials, 'include')
    assert.equal(input.cache, 'no-store')
    assert.equal(input.headers.get('Accept'), 'application/json')
    assert.equal(input.headers.get('Authorization'), null)
    if (input.method === 'DELETE') return new Response(null, { status: 204 })
    if (input.url.includes('/auth/session')) return Response.json(sessionResponse)
    if (input.method === 'GET') return Response.json([question])
    return Response.json(adminQuestion, { status: input.method === 'POST' ? 201 : 200 })
  } })
  assert.deepEqual(await api.login(credentials), sessionResponse)
  assert.deepEqual(await api.getSession(), sessionResponse)
  assert.deepEqual(await api.listQuestions(), [question])
  assert.deepEqual(await api.createQuestion(csrfToken, createBody), adminQuestion)
  assert.deepEqual(await api.updateQuestion(csrfToken, 'id/with ?#', { text: 'Updated question?' }), adminQuestion)
  await api.deleteQuestion(csrfToken, 'id/with ?#')
  await api.logout(csrfToken)
  assert.deepEqual(await api.refresh(csrfToken), sessionResponse)
  assert.deepEqual(await api.recordActivity(csrfToken), sessionResponse)
  assert.deepEqual(calls.map(({ method, url }) => [method, url]), [
    ['POST', 'https://quiz.test/backend/api/v1/auth/session'], ['GET', 'https://quiz.test/backend/api/v1/auth/session'],
    ['GET', 'https://quiz.test/backend/api/v1/questions'], ['POST', 'https://quiz.test/backend/api/v1/questions'],
    ['PATCH', 'https://quiz.test/backend/api/v1/questions/id%2Fwith%20%3F%23'], ['DELETE', 'https://quiz.test/backend/api/v1/questions/id%2Fwith%20%3F%23'],
    ['DELETE', 'https://quiz.test/backend/api/v1/auth/session'], ['POST', 'https://quiz.test/backend/api/v1/auth/session/refresh'],
    ['POST', 'https://quiz.test/backend/api/v1/auth/session/activity'],
  ])
  assert.deepEqual(await calls[0]!.json(), credentials)
  assert.deepEqual(await calls[3]!.json(), createBody)
  assert.deepEqual(await calls[4]!.json(), { text: 'Updated question?' })
  for (const [index, call] of calls.entries()) {
    assert.equal(call.headers.get('X-CSRF-Token'), index >= 3 ? csrfToken : null)
    assert.equal(call.headers.get('Content-Type'), call.body !== null ? 'application/json' : null)
    if (call.method === 'GET' || call.method === 'DELETE') assert.equal(call.body, null)
  }
})

test('DELETE 204 never reads the empty body and rejects unexpected success statuses', async () => {
  const response = new Response(null, { status: 204 })
  response.json = async () => assert.fail('204 must not parse JSON')
  response.text = async () => assert.fail('204 must not read a body')
  const api = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => response })
  await api.deleteQuestion(csrfToken, question.id)
  await api.logout(csrfToken)
  await assert.rejects(withResponse({}, { status: 200 }).deleteQuestion(csrfToken, question.id), /unexpected deletion response/)
  await assert.rejects(withResponse({}, { status: 200 }).logout(csrfToken), /unexpected sign-out response/)
  await assert.rejects(withResponse(sessionResponse, { status: 201 }).getSession(), /unexpected response/)
})

test('validates closed session metadata without accepting exposed bearer credentials or unbounded lifetimes', async () => {
  for (const payload of [
    null, {}, { accessToken: 'exposed-token', tokenType: 'Bearer', expiresIn: 300 },
    { ...sessionResponse, accessToken: 'exposed-token' }, { ...sessionResponse, username: '' },
    { ...sessionResponse, username: ' padded ' }, { ...sessionResponse, username: 'x'.repeat(101) },
    { ...sessionResponse, csrfToken: '' }, { ...sessionResponse, csrfToken: 'x'.repeat(42) },
    { ...sessionResponse, csrfToken: 'x'.repeat(44) }, { ...sessionResponse, csrfToken: '!'.repeat(43) },
    { ...sessionResponse, expiresIn: 0 }, { ...sessionResponse, expiresIn: 901 },
    { ...sessionResponse, accessExpiresIn: 301 }, { ...sessionResponse, accessExpiresIn: -1 },
    { ...sessionResponse, expiresIn: 1 }, { ...sessionResponse, absoluteExpiresIn: 899 },
    { ...sessionResponse, absoluteExpiresIn: 1801 }, { ...sessionResponse, expiresIn: 1.5 },
    { ...sessionResponse, expiresIn: '900' }, { ...sessionResponse, extra: true },
  ]) {
    await assert.rejects(withResponse(payload).login(credentials), /invalid login response/)
    await assert.rejects(withResponse(payload).getSession(), /invalid session response/)
  }
  for (const expiresIn of [1, 900]) {
    const payload = { ...sessionResponse, expiresIn, accessExpiresIn: Math.min(300, expiresIn) }
    assert.deepEqual(await withResponse(payload).login(credentials), payload)
    assert.deepEqual(await withResponse(payload).getSession(), payload)
  }
})

test('invalid CSRF cannot send authenticated writes', async () => {
  for (const invalid of ['', 'short', 'x'.repeat(44), 'x'.repeat(42) + '\n']) {
    const api = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => assert.fail('Invalid CSRF must not send') })
    await assert.rejects(api.createQuestion(invalid, createBody), /session could not be verified/)
    await assert.rejects(api.updateQuestion(invalid, question.id, {}), /session could not be verified/)
    await assert.rejects(api.deleteQuestion(invalid, question.id), /session could not be verified/)
    await assert.rejects(api.logout(invalid), /session could not be verified/)
    await assert.rejects(api.refresh(invalid), /session could not be verified/)
  }
})

test('validates public lists and admin responses without confusing private and public data', async () => {
  assert.deepEqual(await withResponse([]).listQuestions(), [])
  for (const payload of [[adminQuestion], [question, question], [null], {}]) await assert.rejects(withResponse(payload).listQuestions(), /invalid question list/)
  for (const payload of [question, null, { ...adminQuestion, correctAnswer: 'Not an option' }, { ...adminQuestion, correctAnswer: '' }, { ...adminQuestion, options: ['JPY'] }, { ...adminQuestion, options: ['JPY', 'jpy'] }, { ...adminQuestion, extra: true }]) {
    await assert.rejects(withResponse(payload, { status: 201 }).createQuestion(csrfToken, createBody), /invalid saved question/)
    await assert.rejects(withResponse(payload).updateQuestion(csrfToken, question.id, {}), /invalid saved question/)
  }
  const caseInsensitive = { ...adminQuestion, correctAnswer: 'japanese YEN' }
  assert.deepEqual(await withResponse(caseInsensitive, { status: 201 }).createQuestion(csrfToken, createBody), caseInsensitive)
})

test('preserves login versus session failures while hiding secrets and explaining CSRF or origin rejection', async () => {
  const unauthorized = withResponse({ message: credentials.password }, { status: 401 })
  await assert.rejects(unauthorized.login(credentials), /username or password is incorrect/)
  await assert.rejects(unauthorized.getSession(), /session is no longer valid/)
  await assert.rejects(unauthorized.logout(csrfToken), /session is no longer valid/)
  for (const status of [403, 500]) {
    await assert.rejects(withResponse({ message: credentials.password, details: ['database secret'] }, { status }).login(credentials), (cause: unknown) => {
      assert.ok(cause instanceof ApiError)
      assert.equal(cause.status, status)
      assert.doesNotMatch(cause.message, /example-only-password|database secret|Render/)
      assert.match(cause.message, status === 403 ? /origins|verified/ : /having trouble/)
      return true
    })
  }
  await assert.rejects(withResponse({}, { status: 404 }).getSession(), /does not support browser sessions/)
  await assert.rejects(withResponse({}, { status: 404 }).deleteQuestion(csrfToken, question.id), /question is no longer available/)
})

test('uses bounded validation details only from recognized API errors', async () => {
  await assert.rejects(withResponse({ code: 'validation_error', message: 'Validation failed', details: ['Text is required.', 'Options must be unique.'] }, { status: 400 }).createQuestion(csrfToken, createBody), /Text is required\. Options must be unique\./)
  await assert.rejects(withResponse({ code: 'validation_error', message: 'Validation failed', details: Array.from({ length: 20 }, () => 'x'.repeat(500)) }, { status: 400 }).createQuestion(csrfToken, createBody), (cause: unknown) => { assert.ok(cause instanceof ApiError); assert.ok(cause.message.length < 1100); return true })
  for (const body of ['<html>secret stack trace</html>', JSON.stringify({ code: 'unknown', message: 'secret stack trace', details: ['secret stack trace'] })]) {
    const api = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => new Response(body, { status: 400 }) })
    await assert.rejects(api.createQuestion(csrfToken, createBody), (cause: unknown) => { assert.ok(cause instanceof ApiError); assert.equal(cause.status, 400); assert.doesNotMatch(cause.message, /secret stack trace/); return true })
  }
})

test('preserves HTTP statuses for hosting HTML or broken bodies and only 503 mentions Render', async () => {
  for (const status of [401, 403, 500, 502, 503]) for (const body of ['<html>Service unavailable</html>', 'Plain text failure', '{invalid JSON']) {
    const api = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => new Response(body, { status }) })
    await assert.rejects(api.login(credentials), (cause: unknown) => { assert.ok(cause instanceof ApiError); assert.equal(cause.status, status); assert.equal(cause.message.includes('Render'), status === 503); return true })
  }
  for (const status of [400, 503]) {
    const body = new ReadableStream({ start(controller) { controller.error(new Error('Body failed')) } })
    const api = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => new Response(body, { status }) })
    await assert.rejects(api.login(credentials), (cause: unknown) => { assert.ok(cause instanceof ApiError); assert.equal(cause.status, status); return true })
  }
})

test('rate limits retain Retry-After and no writes or refreshes are automatically retried', async () => {
  const methods: Array<(api: AdminApi) => Promise<unknown>> = [
    (api) => api.login(credentials), (api) => api.logout(csrfToken), (api) => api.refresh(csrfToken), (api) => api.recordActivity(csrfToken),
    (api) => api.createQuestion(csrfToken, createBody), (api) => api.updateQuestion(csrfToken, question.id, {}), (api) => api.deleteQuestion(csrfToken, question.id),
  ]
  for (const method of methods) {
    let calls = 0
    const api = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => { calls++; return new Response('Rate limited', { status: 429, headers: { 'Retry-After': '42' } }) } })
    await assert.rejects(method(api), (cause: unknown) => { assert.ok(cause instanceof ApiError); assert.equal(cause.status, 429); assert.equal(cause.retryAfter, 42); assert.match(cause.message, /42 seconds/); return true })
    assert.equal(calls, 1)
  }
})

test('combines caller cancellation with bounded login, read, session and write timeouts', async () => {
  const deadlines: number[] = []
  const timeoutControllers: AbortController[] = []
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds: number) => { deadlines.push(milliseconds); const controller = new AbortController(); timeoutControllers.push(controller); return controller.signal })
  const methods: Array<(api: AdminApi, signal: AbortSignal) => Promise<unknown>> = [
    (api, signal) => api.login(credentials, signal), (api, signal) => api.getSession(signal),
    (api, signal) => api.listQuestions(signal), (api, signal) => api.logout(csrfToken, signal),
    (api, signal) => api.refresh(csrfToken, signal), (api, signal) => api.recordActivity(csrfToken, signal),
    (api, signal) => api.createQuestion(csrfToken, createBody, signal), (api, signal) => api.updateQuestion(csrfToken, question.id, {}, signal), (api, signal) => api.deleteQuestion(csrfToken, question.id, signal),
  ]
  for (const method of methods) {
    const caller = new AbortController()
    const reason = new DOMException('Cancelled', 'AbortError')
    const api = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async (input) => { assert.ok(input instanceof Request); caller.abort(reason); assert.equal(input.signal.aborted, true); assert.equal(input.signal.reason, reason); throw input.signal.reason } })
    await assert.rejects(method(api, caller.signal), (cause: unknown) => { assert.ok(cause instanceof ApiError); assert.equal(cause.cause, reason); return true })
  }
  assert.deepEqual(deadlines, [60_000, 60_000, 60_000, 15_000, 15_000, 15_000, 15_000, 15_000, 15_000])
  const reason = new DOMException('Timed out', 'TimeoutError')
  const api = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async (input) => { assert.ok(input instanceof Request); timeoutControllers.at(-1)!.abort(reason); assert.equal(input.signal.reason, reason); throw input.signal.reason } })
  await assert.rejects(api.login(credentials, new AbortController().signal), (cause: unknown) => { assert.ok(cause instanceof ApiError); assert.equal(cause.cause, reason); assert.match(cause.message, /too long/); assert.doesNotMatch(cause.message, /Render/); return true })
})

test('wraps malformed JSON and network errors without claiming a Render wake-up', async () => {
  const malformed = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => new Response('{invalid JSON') })
  await assert.rejects(malformed.login(credentials), (cause: unknown) => { assert.ok(cause instanceof ApiError); assert.ok(cause.cause instanceof SyntaxError); assert.match(cause.message, /unreadable response/); return true })
  const failure = new TypeError('Failed to fetch')
  const disconnected = createAdminApi({ baseUrl: 'https://quiz.test', fetch: async () => { throw failure } })
  await assert.rejects(disconnected.login(credentials), (cause: unknown) => { assert.ok(cause instanceof ApiError); assert.equal(cause.cause, failure); assert.match(cause.message, /could not reach/); assert.doesNotMatch(cause.message, /Render/); return true })
})
