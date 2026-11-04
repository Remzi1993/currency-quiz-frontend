import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AdminQuestion, BrowserSessionResponse } from '../../shared/generated/typescript/schema'
import { seedQuestions, testCredentials, type ApiScenario, type ApiState } from './seed.ts'

// Deliberately small HTTP fake for frontend browser tests, not an implementation of the backend.
// The runner seeds a separate tenant for each test and removes it even if the test fails.
interface Tenant extends ApiScenario {
  questions: AdminQuestion[]
  signedIn: boolean
  csrfToken: string
  state: ApiState
  pendingAnswers: Array<() => void>
}
const tenants = new Map<string, Tenant>()
const appOrigin = 'http://127.0.0.1:4173'

function json(response: ServerResponse, status: number, body?: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(body === undefined ? undefined : JSON.stringify(body))
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = ''
  for await (const chunk of request) body += String(chunk)
  return body ? JSON.parse(body) as Record<string, unknown> : {}
}

function cookies(request: IncomingMessage): Record<string, string> {
  return Object.fromEntries((request.headers.cookie ?? '').split(';').filter(Boolean).map((cookie) => {
    const separator = cookie.indexOf('=')
    return [cookie.slice(0, separator).trim(), cookie.slice(separator + 1)]
  }))
}

function session(tenant: Tenant): BrowserSessionResponse {
  return { username: testCredentials.username, csrfToken: tenant.csrfToken,
    expiresIn: 900, accessExpiresIn: 300, absoluteExpiresIn: 1800 }
}

function publicQuestion({ id, text, options }: AdminQuestion) { return { id, text, options } }

async function handle(request: IncomingMessage, response: ServerResponse) {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1:18080').pathname
  const method = request.method ?? 'GET'
  if (path === '/__health' && method === 'GET') return json(response, 200, { status: 'ok' })

  const controlId = request.headers['x-e2e-tenant']
  if (path === '/__test__/tenant' && typeof controlId === 'string') {
    if (method === 'POST') {
      const questions = structuredClone(seedQuestions)
      tenants.set(controlId, { questions, signedIn: false, csrfToken: randomBytes(32).toString('base64url'),
        state: { listReads: 0, answers: [], mutations: [], questionCount: questions.length }, pendingAnswers: [] })
      return json(response, 201)
    }
    const tenant = tenants.get(controlId)
    if (!tenant) return json(response, 404)
    if (method === 'DELETE') {
      tenants.delete(controlId)
      // Unblock any response held by a failed async test before destroying its context.
      tenant.pendingAnswers.splice(0).forEach((release) => release())
      return json(response, 204)
    }
    if (method === 'PATCH') {
      const scenario = await readBody(request)
      tenant.failNextList = scenario.failNextList === true
      tenant.rateLimitNextAnswer = scenario.rateLimitNextAnswer === true
      tenant.holdAnswers = scenario.holdAnswers === true
      if (!tenant.holdAnswers) tenant.pendingAnswers.splice(0).forEach((release) => release())
      return json(response, 204)
    }
    if (method === 'GET') return json(response, 200, { ...tenant.state, questionCount: tenant.questions.length })
  }

  const browserCookies = cookies(request)
  const tenantId = browserCookies.e2e_tenant
  const tenant = tenantId ? tenants.get(tenantId) : undefined
  if (!tenant) return json(response, 409, { message: 'Test tenant was not seeded.' })

  const authenticated = tenant.signedIn && browserCookies.currency_quiz_admin === tenantId
  const validWrite = authenticated && request.headers['x-csrf-token'] === tenant.csrfToken
    && request.headers.origin === appOrigin
  if (path === '/api/v1/auth/session') {
    if (method === 'POST') {
      const body = await readBody(request)
      if (request.headers.origin !== appOrigin) return json(response, 403)
      if (body.username !== testCredentials.username || body.password !== testCredentials.password) return json(response, 401)
      tenant.signedIn = true
      response.setHeader('Set-Cookie', [
        `currency_quiz_admin=${tenantId}; HttpOnly; SameSite=Strict; Path=/api/v1`,
        `currency_quiz_admin_refresh=${tenantId}; HttpOnly; SameSite=Strict; Path=/api/v1/auth/session`,
      ])
      return json(response, 200, session(tenant))
    }
    if (method === 'GET') return json(response, authenticated ? 200 : 401, authenticated ? session(tenant) : undefined)
    if (method === 'DELETE') {
      if (!validWrite) return json(response, authenticated ? 403 : 401)
      tenant.signedIn = false
      response.setHeader('Set-Cookie', [
        'currency_quiz_admin=; HttpOnly; SameSite=Strict; Path=/api/v1; Max-Age=0',
        'currency_quiz_admin_refresh=; HttpOnly; SameSite=Strict; Path=/api/v1/auth/session; Max-Age=0',
      ])
      return json(response, 204)
    }
  }
  if (path === '/api/v1/auth/session/activity' && method === 'POST') {
    return json(response, validWrite ? 200 : 403, validWrite ? session(tenant) : undefined)
  }
  if (path === '/api/v1/questions') {
    if (method === 'GET') {
      tenant.state.listReads++
      if (tenant.failNextList) {
        tenant.failNextList = false
        return json(response, 500)
      }
      return json(response, 200, tenant.questions.map(publicQuestion))
    }
    if (method === 'POST') {
      if (!validWrite) return json(response, authenticated ? 403 : 401)
      const body = await readBody(request)
      tenant.state.mutations.push({ method, body })
      const question = { id: randomUUID(), ...body } as AdminQuestion
      tenant.questions.push(question)
      response.setHeader('Location', `/api/v1/questions/${question.id}`)
      return json(response, 201, question)
    }
  }
  const answerMatch = /^\/api\/v1\/questions\/([^/]+)\/answers$/.exec(path)
  if (answerMatch && method === 'POST') {
    const question = tenant.questions.find(({ id }) => id === answerMatch[1])
    if (!question) return json(response, 404)
    const body = await readBody(request)
    tenant.state.answers.push({ questionId: question.id, answer: String(body.answer) })
    if (tenant.rateLimitNextAnswer) {
      tenant.rateLimitNextAnswer = false
      response.setHeader('Retry-After', '2')
      return json(response, 429)
    }
    if (tenant.holdAnswers) await new Promise<void>((resolve) => { tenant.pendingAnswers.push(resolve) })
    return json(response, 200, { correct: String(body.answer).trim().toLowerCase() === question.correctAnswer.toLowerCase() })
  }
  const questionMatch = /^\/api\/v1\/questions\/([^/]+)$/.exec(path)
  if (questionMatch) {
    const question = tenant.questions.find(({ id }) => id === questionMatch[1])
    if (!question) return json(response, 404)
    if (method === 'GET') return json(response, 200, publicQuestion(question))
    if (!validWrite) return json(response, authenticated ? 403 : 401)
    if (method === 'PATCH') {
      const body = await readBody(request)
      tenant.state.mutations.push({ method, body })
      Object.assign(question, body)
      return json(response, 200, question)
    }
    if (method === 'DELETE') {
      tenant.state.mutations.push({ method, body: null })
      tenant.questions = tenant.questions.filter(({ id }) => id !== question.id)
      return json(response, 204)
    }
  }
  return json(response, 404)
}

const server = createServer((request, response) => {
  void handle(request, response).catch((error: unknown) => {
    console.error(error)
    if (!response.headersSent) json(response, 500)
    else response.destroy()
  })
})
server.listen(18080, '127.0.0.1')
