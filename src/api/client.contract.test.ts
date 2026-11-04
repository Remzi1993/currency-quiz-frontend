import { readFileSync } from 'node:fs'
import { Ajv, type AnySchema } from 'ajv'
import addFormats from 'ajv-formats'
import { parse } from 'yaml'
import { expect, test } from 'vitest'
import { createQuizApi } from './client.ts'

interface JsonOperation {
  operationId: string
  requestBody?: { content: { 'application/json': { schema: AnySchema } } }
  responses: Record<string, { content: { 'application/json': { schema: AnySchema } } }>
}

interface QuizContract {
  components: { schemas: Record<string, AnySchema> }
  paths: Record<string, Partial<Record<'get' | 'post', JsonOperation>>>
}

const contract = parse(readFileSync(new URL('../../shared/openapi/currency-quiz.v1.yaml', import.meta.url), 'utf8')) as QuizContract
// OpenAPI's components keyword holds local $refs; it is not a JSON Schema validation keyword.
const ajv = new Ajv({ allErrors: true, strictSchema: false })
addFormats(ajv)

function operation(operationId: string) {
  for (const [path, methods] of Object.entries(contract.paths)) {
    for (const [method, definition] of Object.entries(methods)) {
      if (definition.operationId === operationId) return { path, method: method.toUpperCase(), definition }
    }
  }
  throw new Error(`The pinned contract has no ${operationId} operation`)
}

function validator(schema: AnySchema) {
  if (typeof schema === 'boolean') return ajv.compile(schema)
  return ajv.compile({ ...schema, components: contract.components })
}

const list = operation('listQuestions')
const answer = operation('submitAnswer')
const listResponse = validator(list.definition.responses['200']!.content['application/json'].schema)
const answerRequest = validator(answer.definition.requestBody!.content['application/json'].schema)
const answerResponse = validator(answer.definition.responses['200']!.content['application/json'].schema)
const question = {
  id: 'c72b3aab-633f-4268-88e7-c6ba1c3bb217',
  text: 'Which currency is used in Japan?',
  options: ['Japanese yen', 'Euro'],
}

test('the consumer lists questions using the method, route and response schema from the pinned OpenAPI contract', async () => {
  const payload = [question]
  expect(listResponse(payload), ajv.errorsText(listResponse.errors)).toBe(true)
  const api = createQuizApi({
    baseUrl: 'http://contract.test',
    fetch: async (input) => {
      expect(input).toBeInstanceOf(Request)
      const request = input as Request
      expect(request.method).toBe(list.method)
      expect(new URL(request.url).pathname).toBe(list.path)
      expect(request.headers.get('Accept')).toBe('application/json')
      expect(request.body).toBeNull()
      return Response.json(payload)
    },
  })

  const result = await api.loadQuestions()
  expect(result).toEqual(payload)
  expect(listResponse(result), ajv.errorsText(listResponse.errors)).toBe(true)
})

test.each([true, false])('the consumer answer request and correct=%s response satisfy the independent API schemas', async (correct) => {
  const payload = { correct }
  expect(answerResponse(payload), ajv.errorsText(answerResponse.errors)).toBe(true)
  const api = createQuizApi({
    baseUrl: 'http://contract.test',
    fetch: async (input) => {
      const request = input as Request
      expect(request.method).toBe(answer.method)
      expect(new URL(request.url).pathname).toBe(answer.path.replace('{id}', question.id))
      expect(request.headers.get('Content-Type')).toBe('application/json')
      expect(request.headers.get('Accept')).toBe('application/json')
      const body: unknown = await request.json()
      expect(answerRequest(body), ajv.errorsText(answerRequest.errors)).toBe(true)
      expect(body).toEqual({ answer: 'Japanese yen' })
      return Response.json(payload)
    },
  })

  const result = await api.submitAnswer(question.id, 'Japanese yen')
  expect(result).toEqual(payload)
  expect(answerResponse(result), ajv.errorsText(answerResponse.errors)).toBe(true)
})

test.each([
  { name: 'missing question text', payload: [{ id: question.id, options: question.options }] },
  { name: 'invalid question UUID', payload: [{ ...question, id: 'not-a-uuid' }] },
  { name: 'too few answer options', payload: [{ ...question, options: ['Japanese yen'] }] },
  { name: 'leaked correct answer', payload: [{ ...question, correctAnswer: 'Japanese yen' }] },
])('the schema and consumer both reject $name in a public response', async ({ payload }) => {
  expect(listResponse(payload)).toBe(false)
  const api = createQuizApi({ baseUrl: 'http://contract.test', fetch: async () => Response.json(payload) })
  await expect(api.loadQuestions()).rejects.toMatchObject({
    name: 'ApiError', message: expect.stringContaining('invalid questions'),
  })
})

test.each([
  { name: 'missing correctness', payload: {} },
  { name: 'a string correctness flag', payload: { correct: 'false' } },
  { name: 'a leaked answer field', payload: { correct: false, correctAnswer: 'Japanese yen' } },
])('the schema and consumer both reject $name in an answer response', async ({ payload }) => {
  expect(answerResponse(payload)).toBe(false)
  const api = createQuizApi({ baseUrl: 'http://contract.test', fetch: async () => Response.json(payload) })
  await expect(api.submitAnswer(question.id, 'Euro')).rejects.toMatchObject({
    name: 'ApiError', message: expect.stringContaining('invalid answer result'),
  })
})
