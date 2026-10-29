import createClient from 'openapi-fetch'
import type { components, paths } from '../../shared/generated/typescript/schema'

export type Question = components['schemas']['PublicQuestion']
export type AnswerResult = components['schemas']['AnswerResponse']

export class ApiError extends Error {
  readonly status: number | undefined
  readonly retryAfter: number | undefined

  constructor(message: string, options: { status?: number; retryAfter?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = 'ApiError'
    this.status = options.status
    this.retryAfter = options.retryAfter
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isQuestion(value: unknown): value is Question {
  if (!isRecord(value)) return false

  const { id, text, options } = value
  return (
    Object.keys(value).length === 3 &&
    typeof id === 'string' &&
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id) &&
    typeof text === 'string' &&
    text.trim().length > 0 &&
    text.length <= 500 &&
    Array.isArray(options) &&
    options.length >= 2 &&
    options.length <= 10 &&
    options.every((option: unknown) => typeof option === 'string' && option.trim().length > 0 && option.length <= 200) &&
    new Set(options.map((option: string) => option.trim().toLowerCase())).size === options.length
  )
}

function responseError(response: Response): ApiError {
  const retryHeader = response.headers.get('Retry-After')
  const seconds = retryHeader === null ? Number.NaN : Number(retryHeader)
  const retryAfter = Number.isInteger(seconds) && seconds >= 0 ? seconds : undefined

  const messages: Record<number, string> = {
    400: 'This answer could not be accepted. Please try again.',
    403: 'The quiz service does not allow this website to connect. Check the backend origin settings.',
    404: 'This question is no longer available. Reload the questions to get the latest quiz.',
    415: 'The quiz service could not read the request. Please try again.',
    429: retryAfter === undefined
      ? 'You are answering a little too quickly. Wait a minute, then try again.'
      : `You are answering a little too quickly. Try again in ${retryAfter} ${retryAfter === 1 ? 'second' : 'seconds'}.`,
  }

  return new ApiError(messages[response.status] ?? 'The quiz service is having trouble. Please try again shortly.', {
    status: response.status,
    ...(retryAfter === undefined ? {} : { retryAfter }),
  })
}

async function request<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new ApiError('The quiz service took too long to respond. Please try again.', { cause: error })
    }
    if (error instanceof SyntaxError) {
      throw new ApiError('The quiz service sent an unreadable response. Please try again.', { cause: error })
    }
    throw new ApiError('We could not reach the quiz service. Check your connection and try again.', { cause: error })
  }
}

/** Typed contract client. A custom fetch keeps HTTP behavior testable without a running backend. */
export function createQuizApi(options: { baseUrl?: string; fetch?: typeof globalThis.fetch } = {}) {
  const client = createClient<paths>({
    baseUrl: (options.baseUrl ?? '').replace(/\/+$/, ''),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  })

  return {
    loadQuestions(): Promise<Question[]> {
      return request(async () => {
        const { data, response } = await client.GET('/api/v1/questions', {
          signal: AbortSignal.timeout(15_000),
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) throw responseError(response)
        if (!Array.isArray(data) || !data.every(isQuestion) || new Set(data.map(({ id }) => id)).size !== data.length) {
          throw new ApiError('The quiz service returned invalid questions. Please try again.')
        }
        return data
      })
    },

    submitAnswer(questionId: string, answer: string): Promise<AnswerResult> {
      return request(async () => {
        const { data, response } = await client.POST('/api/v1/questions/{id}/answers', {
          params: { path: { id: questionId } },
          body: { answer },
          signal: AbortSignal.timeout(15_000),
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) throw responseError(response)
        if (!isRecord(data) || Object.keys(data).length !== 1 || typeof data.correct !== 'boolean') {
          throw new ApiError('The quiz service returned an invalid answer result. Please try again.')
        }
        return { correct: data.correct }
      })
    },
  }
}

let defaultApi: ReturnType<typeof createQuizApi> | undefined

function getApi() {
  defaultApi ??= createQuizApi({ baseUrl: import.meta.env?.VITE_API_BASE_URL ?? '' })
  return defaultApi
}

export function loadQuestions(): Promise<Question[]> {
  return getApi().loadQuestions()
}

export function submitAnswer(questionId: string, answer: string): Promise<AnswerResult> {
  return getApi().submitAnswer(questionId, answer)
}
