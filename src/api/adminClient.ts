import type {
  AdminQuestion, CreateQuestionRequest, LoginRequest, PublicQuestion,
  TokenResponse, UpdateQuestionRequest,
} from '../../shared/generated/typescript/schema'
import { ApiError, isQuestion } from './client.ts'

export type {
  AdminQuestion, CreateQuestionRequest, LoginRequest, PublicQuestion,
  TokenResponse, UpdateQuestionRequest,
} from '../../shared/generated/typescript/schema'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAdminQuestion(value: unknown): value is AdminQuestion {
  if (!isRecord(value) || Object.keys(value).length !== 4) return false
  const question = { id: value.id, text: value.text, options: value.options }
  const correctAnswer = value.correctAnswer
  return isQuestion(question) && typeof correctAnswer === 'string'
    && correctAnswer.trim().length > 0 && correctAnswer.length <= 200
    && question.options.some((option) => option.trim().toLowerCase() === correctAnswer.trim().toLowerCase())
}

function isToken(value: unknown): value is TokenResponse {
  return isRecord(value) && Object.keys(value).length === 3
    && typeof value.accessToken === 'string' && value.accessToken.trim().length > 0
    && value.accessToken === value.accessToken.trim()
    && value.tokenType === 'Bearer' && typeof value.expiresIn === 'number'
    && Number.isInteger(value.expiresIn) && value.expiresIn >= 1 && value.expiresIn <= 86_400
}

async function validationDetails(response: Response): Promise<string> {
  try {
    const text = await response.text()
    if (text.length > 8_192) return ''
    const body: unknown = JSON.parse(text)
    if (!isRecord(body) || Object.keys(body).length !== 3 || body.code !== 'validation_error'
      || typeof body.message !== 'string' || body.message.length > 200
      || !Array.isArray(body.details) || !body.details.every((detail: unknown) => typeof detail === 'string')) return ''
    return body.details.slice(0, 5)
      .map((detail: string) => detail.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200))
      .filter(Boolean).join(' ')
  } catch { return '' }
}

async function responseError(response: Response, login: boolean): Promise<ApiError> {
  const retryHeader = response.headers.get('Retry-After')?.trim()
  const seconds = retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : Number.NaN
  const retryAfter = Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : undefined
  let message: string
  switch (response.status) {
    case 400: {
      const details = await validationDetails(response)
      message = `${login ? 'Check your username and password.' : 'Check the question fields and try again.'}${details ? ` ${details}` : ''}`
      break
    }
    case 401:
      message = login ? 'The username or password is incorrect.' : 'Your admin session is no longer valid. Please sign in again.'
      break
    case 403:
      message = 'This website is not allowed to connect to the quiz service. Check the backend origin settings.'
      break
    case 404:
      message = 'This question is no longer available. Reload the question list and try again.'
      break
    case 415:
      message = 'The quiz service could not read the request. Please try again.'
      break
    case 429:
      message = retryAfter === undefined
        ? 'Too many requests. Wait a minute, then try again.'
        : `Too many requests. Try again in ${retryAfter} ${retryAfter === 1 ? 'second' : 'seconds'}.`
      break
    case 503:
      message = 'The quiz service is unavailable. Render’s Free plan may need up to one minute to wake after inactivity. Please try again shortly.'
      break
    default:
      message = 'The quiz service is having trouble. Please try again shortly.'
  }
  return new ApiError(message, { status: response.status, ...(retryAfter === undefined ? {} : { retryAfter }) })
}

async function request<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() } catch (cause) {
    if (cause instanceof ApiError) throw cause
    if (cause instanceof DOMException && (cause.name === 'TimeoutError' || cause.name === 'AbortError')) {
      throw new ApiError('The quiz service took too long to respond. Please try again.', { cause })
    }
    if (cause instanceof SyntaxError) {
      throw new ApiError('The quiz service sent an unreadable response. Please try again.', { cause })
    }
    throw new ApiError('We could not reach the quiz service. Check your connection and try again.', { cause })
  }
}

/** Explicit bearer arguments keep credentials and session storage outside the HTTP client. */
export function createAdminApi(options: { baseUrl?: string; fetch?: typeof globalThis.fetch } = {}) {
  const baseUrl = (options.baseUrl ?? '').trim().replace(/\/+$/, '')
  const fetchRequest = options.fetch ?? globalThis.fetch

  async function send(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', timeoutMs: number, signal: AbortSignal | undefined, token?: string, body?: object): Promise<Response> {
    const timeout = AbortSignal.timeout(timeoutMs)
    const response = await fetchRequest(new Request(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
      credentials: 'omit',
    }))
    // Preserve HTTP status even when a host sends HTML, invalid JSON, or a broken body.
    if (!response.ok) throw await responseError(response, path === '/api/v1/auth/login')
    return response
  }

  async function json(response: Response, expectedStatus: number): Promise<unknown> {
    if (response.status !== expectedStatus) throw new ApiError('The quiz service returned an unexpected response. Please try again.')
    return response.json() as Promise<unknown>
  }

  return {
    login(credentials: LoginRequest, signal?: AbortSignal): Promise<TokenResponse> {
      return request(async () => {
        const response = await send('/api/v1/auth/login', 'POST', 60_000, signal, undefined, credentials)
        const data = await json(response, 200)
        if (!isToken(data)) throw new ApiError('The quiz service returned an invalid login response. Please try again.')
        return data
      })
    },

    listQuestions(token: string, signal?: AbortSignal): Promise<PublicQuestion[]> {
      return request(async () => {
        const response = await send('/api/v1/questions', 'GET', 60_000, signal, token)
        const data = await json(response, 200)
        if (!Array.isArray(data) || !data.every(isQuestion) || new Set(data.map(({ id }) => id.toLowerCase())).size !== data.length) {
          throw new ApiError('The quiz service returned an invalid question list. Please try again.')
        }
        return data
      })
    },

    createQuestion(token: string, body: CreateQuestionRequest, signal?: AbortSignal): Promise<AdminQuestion> {
      return request(async () => {
        const response = await send('/api/v1/questions', 'POST', 15_000, signal, token, body)
        const data = await json(response, 201)
        if (!isAdminQuestion(data)) throw new ApiError('The quiz service returned an invalid saved question. Reload the list before trying again.')
        return data
      })
    },

    updateQuestion(token: string, id: string, body: UpdateQuestionRequest, signal?: AbortSignal): Promise<AdminQuestion> {
      return request(async () => {
        const response = await send(`/api/v1/questions/${encodeURIComponent(id)}`, 'PATCH', 15_000, signal, token, body)
        const data = await json(response, 200)
        if (!isAdminQuestion(data)) throw new ApiError('The quiz service returned an invalid saved question. Reload the list before trying again.')
        return data
      })
    },

    deleteQuestion(token: string, id: string, signal?: AbortSignal): Promise<void> {
      return request(async () => {
        const response = await send(`/api/v1/questions/${encodeURIComponent(id)}`, 'DELETE', 15_000, signal, token)
        if (response.status !== 204) throw new ApiError('The quiz service returned an unexpected deletion response. Reload the list before trying again.')
      })
    },
  }
}

export type AdminApi = ReturnType<typeof createAdminApi>
let defaultApi: AdminApi | undefined

export function getAdminApi(): AdminApi {
  defaultApi ??= createAdminApi({ baseUrl: import.meta.env?.VITE_API_BASE_URL ?? '' })
  return defaultApi
}
