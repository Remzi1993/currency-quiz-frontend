import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'
import {
  buildEndpointUrl, buildJavaScriptExample, buildShellExamples,
  endpoints, exampleQuestionId, publicQuestionExample, type ApiEndpoint,
} from './apiReference.ts'

function endpoint(id: string): ApiEndpoint {
  const found = endpoints.find((entry) => entry.id === id)
  assert.ok(found, `Missing documentation for ${id}`)
  return found
}

test('covers all OpenAPI operations and their declared request and response details', () => {
  const httpMethods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const
  type Security = Array<Record<string, string[]>>
  interface Operation {
    requestBody?: unknown
    responses: Record<string, { content?: Record<string, unknown> }>
    security?: Security
  }
  interface Contract {
    paths: Record<string, Partial<Record<typeof httpMethods[number], Operation>>>
    security?: Security
  }
  const contract = parse(readFileSync(new URL('../../shared/openapi/currency-quiz.v1.yaml', import.meta.url), 'utf8')) as Contract
  const operations = new Map<string, Operation>()
  for (const [path, item] of Object.entries(contract.paths)) {
    for (const method of httpMethods) {
      const operation = item[method]
      if (operation) operations.set(`${method.toUpperCase()} ${path}`, operation)
    }
  }

  const documentedOperations = endpoints.map(({ method, path }) => `${method} ${path}`)
  assert.deepEqual(documentedOperations.toSorted(), [...operations.keys()].toSorted())
  assert.equal(new Set(documentedOperations).size, endpoints.length)
  assert.equal(new Set(endpoints.map(({ id }) => id)).size, endpoints.length)
  for (const entry of endpoints) {
    const key = `${entry.method} ${entry.path}`
    const operation = operations.get(key)
    assert.ok(operation, `Missing OpenAPI operation: ${key}`)
    const statuses = Object.keys(operation.responses).map(Number).toSorted((first, second) => first - second)
    assert.deepEqual(entry.responses.map(({ status }) => status).toSorted((first, second) => first - second), statuses, `${key} response statuses`)
    assert.ok(statuses.includes(entry.successStatus) && entry.successStatus >= 200 && entry.successStatus < 300, `${key} success status`)
    const security = operation.security ?? contract.security ?? []
    assert.equal(entry.auth, security.length > 0 && security.every((requirement) => Object.hasOwn(requirement, 'adminBearer')), `${key} admin authentication`)
    assert.equal(entry.requestBody !== undefined, operation.requestBody !== undefined, `${key} request body`)
    assert.equal(entry.responseBody !== undefined, operation.responses[String(entry.successStatus)]?.content?.['application/json'] !== undefined, `${key} response body`)
    assert.equal(Boolean(entry.parameters?.length), entry.path.includes('{id}'))
  }
})

test('public examples keep answers private and distinguish outcome checking from admin data', () => {
  assert.deepEqual(Object.keys(publicQuestionExample).sort(), ['id', 'options', 'text'])
  assert.deepEqual(endpoint('list-questions').responseBody, [publicQuestionExample])
  assert.deepEqual(endpoint('get-question').responseBody, publicQuestionExample)
  assert.deepEqual(endpoint('check-answer').responseBody, { correct: true })
  assert.equal(endpoint('delete-question').responseBody, undefined)
  assert.match(endpoint('check-answer').notes.join(' '), /30 submissions per minute per client IP/)
  assert.match(endpoint('check-answer').notes.join(' '), /200.*false/)
  assert.match(endpoint('login').notes.join(' '), /5 requests per minute per client IP/)
  assert.match(endpoint('update-question').notes.join(' '), /non-null.*null fields.*previous/s)
})

test('builds same-origin or configured-base URLs with encoded path parameters', () => {
  const entry = endpoint('get-question')
  assert.equal(buildEndpointUrl('', entry), `/api/v1/questions/${exampleQuestionId}`)
  assert.equal(buildEndpointUrl(' https://quiz.test/backend/// ', entry), `https://quiz.test/backend/api/v1/questions/${exampleQuestionId}`)
  assert.equal(buildEndpointUrl('https://quiz.test', entry, "a/b ?#'()!*"), 'https://quiz.test/api/v1/questions/a%2Fb%20%3F%23%27%28%29%21%2A')
  assert.equal(buildEndpointUrl('https://quiz.test/', endpoint('list-questions'), 'unused'), 'https://quiz.test/api/v1/questions')
})

async function runJavaScript(entry: ApiEndpoint, ok = true) {
  const calls: Array<{ url: string; options: RequestInit }> = []
  const output: unknown[] = []
  let jsonReads = 0
  const fetchExample = async (url: string, options: RequestInit) => {
    calls.push({ url, options })
    return {
      ok, status: ok ? entry.successStatus : 500, statusText: ok ? 'OK' : 'Internal Server Error',
      async json() {
        jsonReads++
        assert.notEqual(entry.successStatus, 204, 'A 204 response must never be parsed as JSON')
        return entry.responseBody
      },
    }
  }
  const run = new Function('fetch', 'console', 'process', `return (async () => {\n${buildJavaScriptExample('https://quiz.test', entry)}\n})()`)
  const result = run(fetchExample, { log: (value: unknown) => output.push(value) }, { env: { ADMIN_TOKEN: 'placeholder-test-token' } }) as Promise<void>
  return { result, calls, output, get jsonReads() { return jsonReads } }
}

test('generated JavaScript executes the documented method, URL, body and auth headers', async () => {
  for (const entry of endpoints) {
    const execution = await runJavaScript(entry)
    await execution.result
    assert.equal(execution.calls.length, 1)
    const call = execution.calls[0]!
    assert.equal(call.url, buildEndpointUrl('https://quiz.test', entry))
    assert.equal(call.options.method, entry.method)
    const headers = new Headers(call.options.headers)
    assert.equal(headers.get('Authorization'), entry.auth ? 'Bearer placeholder-test-token' : null)
    assert.equal(headers.get('Content-Type'), entry.requestBody ? 'application/json' : null)
    assert.deepEqual(call.options.body ? JSON.parse(String(call.options.body)) : undefined, entry.requestBody)
    assert.equal(execution.jsonReads, entry.successStatus === 204 ? 0 : 1)
  }
})

test('JavaScript checks response.ok before parsing or reporting success, including DELETE', async () => {
  for (const entry of endpoints) {
    const execution = await runJavaScript(entry, false)
    await assert.rejects(execution.result, /Request failed: 500 Internal Server Error/)
    assert.equal(execution.jsonReads, 0)
    assert.deepEqual(execution.output, [])
  }
})

test('auth JavaScript reads ADMIN_TOKEN from the environment and fails before sending when missing', async () => {
  for (const entry of endpoints.filter(({ auth }) => auth)) {
    const source = buildJavaScriptExample('https://quiz.test', entry)
    assert.match(source, /process\.env\.ADMIN_TOKEN/)
    assert.doesNotMatch(source, /localStorage|sessionStorage/)
    const run = new Function('fetch', 'process', `return (async () => {\n${source}\n})()`)
    const result = run(() => assert.fail('Missing credentials must not send a request'), { env: {} }) as Promise<void>
    await assert.rejects(result, /Set ADMIN_TOKEN/)
  }
})

test('shared GET shell examples are emitted once and writes use native shell conventions', () => {
  for (const entry of endpoints) {
    const examples = buildShellExamples('https://quiz.test', entry)
    if (entry.method === 'GET') {
      assert.deepEqual(Object.keys(examples), ['shared'])
      assert.match(examples.shared!, /^curl --fail-with-body/)
      assert.doesNotMatch(examples.shared!, /curl\.exe|Invoke-WebRequest/)
    } else {
      assert.equal(examples.shared, undefined)
      assert.match(examples.powershell!, new RegExp(`Invoke-RestMethod -Method ${entry.method}`))
      assert.match(examples.bash!, new RegExp(`curl --fail-with-body --request ${entry.method}`))
      assert.equal(examples.powershell!.includes('$env:ADMIN_TOKEN'), entry.auth)
      assert.equal(examples.bash!.includes('${ADMIN_TOKEN}'), entry.auth)
      assert.equal(examples.powershell!.includes('-ContentType'), Boolean(entry.requestBody))
      assert.equal(examples.bash!.includes('--data-raw'), Boolean(entry.requestBody))
      if (entry.requestBody) {
        const serialized = JSON.stringify(entry.requestBody, null, 2)
        assert.ok(examples.powershell!.includes(`$body = @'\n${serialized}\n'@`))
        assert.ok(examples.bash!.includes(serialized))
      }
    }
  }
})

test('quotes apostrophes correctly when shell URL quoting differs', () => {
  const examples = buildShellExamples("https://quiz.test/it's", endpoint('get-question'))
  assert.equal(examples.shared, undefined)
  assert.ok(examples.powershell!.includes("'https://quiz.test/it''s/api/"))
  assert.ok(examples.bash!.includes("'https://quiz.test/it'\"'\"'s/api/"))
  assert.doesNotMatch(examples.powershell!, /\\\n/)
  assert.match(examples.powershell!, /`\n/)
  assert.match(examples.bash!, /\\\n/)
})
