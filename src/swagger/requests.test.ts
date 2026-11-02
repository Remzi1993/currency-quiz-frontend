import assert from 'node:assert/strict'
import { test } from 'node:test'
import type SwaggerUI from 'swagger-ui'
import { prepareSwaggerRequest } from './requests.ts'

const origin = 'https://quiz.example'

test('cookie writes use browser credentials and preserve CSRF while removing forbidden header fields', () => {
  const request: SwaggerUI.Request = {
    url: `${origin}/api/v1/questions`, method: 'POST',
    headers: { ORIGIN: 'https://sample.example', Cookie: 'cannot-set-this', cookie2: 'old', Host: 'wrong', Referer: 'wrong', 'X-CSRF-Token': 'a'.repeat(43) },
    body: '{"text":"Example"}',
  }
  const prepared = prepareSwaggerRequest(request, origin)
  assert.equal(prepared.credentials, 'include')
  assert.equal(prepared.redirect, 'error')
  assert.deepEqual(prepared.headers, { 'x-csrf-token': 'a'.repeat(43) })
  assert.equal(prepared.body, request.body)
  assert.ok(prepared.signal instanceof AbortSignal)
})

test('bearer authorization stays in the request and specification assets receive no credentials', () => {
  const api = prepareSwaggerRequest({ url: '/api/v1/questions/123', headers: new Headers({ Authorization: 'Bearer example' }) }, origin)
  assert.equal(api.headers.authorization, 'Bearer example')
  const spec = prepareSwaggerRequest({ url: `${origin}/assets/contract.yaml`, headers: { Authorization: 'Bearer example', 'X-CSRF-Token': 'example' } }, origin)
  assert.equal(spec.credentials, 'omit')
  assert.deepEqual(spec.headers, {})
})

test('foreign origins and embedded credentials cannot receive Swagger credentials', () => {
  for (const url of ['https://foreign.example/api/v1/questions', 'https://user:password@quiz.example/api/v1/questions', 'https://quiz.example.attacker.test/api/v1/questions', 'data:text/plain,test']) {
    assert.throws(() => prepareSwaggerRequest({ url, headers: { Authorization: 'Bearer example' } }, origin), /proxy/)
  }
  assert.throws(() => prepareSwaggerRequest({}, origin), /URL is missing/)
})

test('a caller can cancel a Swagger request and no operation is sent or retried by the interceptor', () => {
  const controller = new AbortController()
  const request = prepareSwaggerRequest({ url: '/api/v1/auth/session/refresh', headers: {}, signal: controller.signal }, origin)
  assert.equal(request.signal.aborted, false)
  controller.abort()
  assert.equal(request.signal.aborted, true)
})
