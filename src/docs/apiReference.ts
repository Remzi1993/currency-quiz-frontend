import type { components, paths } from '../../shared/generated/typescript/schema'

type HttpMethod = 'get' | 'post' | 'patch' | 'delete'
type JsonRequest<Operation> = Operation extends { requestBody: { content: { 'application/json': infer Body } } } ? Body : never
type ResponseStatus<Operation> = Operation extends { responses: infer Responses } ? keyof Responses & number : never
type SuccessStatus<Operation> = Extract<ResponseStatus<Operation>, 200 | 201 | 204>
type JsonResponse<Operation> = Operation extends { responses: infer Responses }
  ? { [Status in keyof Responses & (200 | 201 | 204)]: Responses[Status] extends { content: { 'application/json': infer Body } } ? Body : never }[keyof Responses & (200 | 201 | 204)]
  : never

interface EndpointDetails {
  id: string
  title: string
  label: string
  group: 'Public quiz' | 'Administration'
  description: string
  auth: boolean
  notes: string[]
  parameters?: Array<{ name: string; description: string; required: boolean; example: string }>
}

/** Only method/path combinations and JSON examples present in the generated contract are allowed. */
export type ApiEndpoint = {
  [Path in keyof paths]: {
    [Method in HttpMethod]: paths[Path][Method] extends { responses: object }
      ? EndpointDetails & {
        method: Uppercase<Method>
        path: Path
        requestBody?: JsonRequest<paths[Path][Method]>
        responseBody?: JsonResponse<paths[Path][Method]>
        successStatus: SuccessStatus<paths[Path][Method]>
        responses: Array<{ status: ResponseStatus<paths[Path][Method]>; description: string }>
      }
      : never
  }[HttpMethod]
}[keyof paths]

export const exampleQuestionId = 'c72b3aab-633f-4268-88e7-c6ba1c3bb217'
export const publicQuestionExample: components['schemas']['PublicQuestion'] = {
  id: exampleQuestionId,
  text: 'Which currency is used in Japan?',
  options: ['Chinese yuan', 'Japanese yen', 'South Korean won', 'Thai baht'],
}

const adminQuestionExample: components['schemas']['AdminQuestion'] = { ...publicQuestionExample, correctAnswer: 'JPY' }
const idParameter = [{
  name: 'id', required: true, example: exampleQuestionId,
  description: 'Question UUID in the URL. A malformed UUID returns 400; an unknown UUID returns 404.',
}]
const badRequest = { status: 400, description: 'Invalid JSON, fields, question ID, or resulting question.' } as const
const unauthorized = { status: 401, description: 'Invalid credentials or a missing, expired, or invalid admin token.' } as const
const notFound = { status: 404, description: 'Question or route not found.' } as const
const unsupportedMedia = { status: 415, description: 'The request Content-Type must be application/json.' } as const
const rateLimited = { status: 429, description: 'Rate limit exceeded. Retry-After gives the number of seconds to wait.' } as const
const internalError = { status: 500, description: 'Unexpected server error. Internal details stay private.' } as const

export const endpoints: ApiEndpoint[] = [
  {
    id: 'list-questions', title: 'List all questions', label: 'List questions', group: 'Public quiz',
    method: 'GET', path: '/api/v1/questions', auth: false,
    description: 'Get the question bank and its answer options to begin a quiz. No account is needed.',
    responseBody: [publicQuestionExample], successStatus: 200,
    notes: [
      'Questions never include the correct answer. Use the answer-checking endpoint to grade a choice.',
      'New installations start with 40 sample questions; the list can be empty after administration changes.',
      'Requests from a disallowed browser origin return 403.',
    ],
    responses: [
      { status: 200, description: 'An array of questions.' },
      { status: 403, description: 'The request origin is not allowed.' }, internalError,
    ],
  },
  {
    id: 'get-question', title: 'Get a question', label: 'Get a question', group: 'Public quiz',
    method: 'GET', path: '/api/v1/questions/{id}', auth: false,
    description: 'Look up one question by its UUID, including all available answer options.',
    parameters: idParameter, responseBody: publicQuestionExample, successStatus: 200,
    notes: ['The response has id, text, and options. The correct answer stays private.'],
    responses: [{ status: 200, description: 'The public question.' }, badRequest, notFound, internalError],
  },
  {
    id: 'check-answer', title: 'Check an answer', label: 'Check an answer', group: 'Public quiz',
    method: 'POST', path: '/api/v1/questions/{id}/answers', auth: false,
    description: 'Ask the server whether an answer is correct. The response reveals only the outcome.',
    parameters: idParameter, requestBody: { answer: 'Japanese yen' }, responseBody: { correct: true }, successStatus: 200,
    notes: [
      'An incorrect answer is also a successful HTTP 200 response: { "correct": false }.',
      'Limited to 30 submissions per minute per client IP across all questions. A 429 response includes Retry-After seconds.',
      'Surrounding whitespace is trimmed and comparisons ignore case. Answers need not match a listed option.',
      'After trimming, answer must contain 1–200 UTF-16 code units.',
    ],
    responses: [{ status: 200, description: 'A boolean correct field; no correct answer is returned.' }, badRequest, notFound, unsupportedMedia, rateLimited, internalError],
  },
  {
    id: 'login', title: 'Get an admin token', label: 'Admin login', group: 'Administration',
    method: 'POST', path: '/api/v1/auth/login', auth: false,
    description: 'Exchange the configured admin username and password for a bearer token.',
    requestBody: { username: 'YOUR_ADMIN_USERNAME', password: 'YOUR_ADMIN_PASSWORD' },
    responseBody: { accessToken: 'YOUR_ADMIN_TOKEN', tokenType: 'Bearer', expiresIn: 3600 }, successStatus: 200,
    notes: [
      'Limited to 5 requests per minute per client IP. Use HTTPS outside local development.',
      'expiresIn is the configured token lifetime in seconds (1–86,400). The example shows 3,600 seconds.',
      'Send the returned token as Authorization: Bearer YOUR_ADMIN_TOKEN for administration requests.',
      'Username must contain 1–100 characters and password 1–1,024 characters. Examples contain placeholders only.',
    ],
    responses: [{ status: 200, description: 'The signed access token, Bearer token type, and lifetime in seconds.' }, badRequest, unauthorized, unsupportedMedia, rateLimited, internalError],
  },
  {
    id: 'create-question', title: 'Create a question', label: 'Create a question', group: 'Administration',
    method: 'POST', path: '/api/v1/questions', auth: true,
    description: 'Add a question to the quiz bank using an admin bearer token.',
    requestBody: {
      text: publicQuestionExample.text,
      options: publicQuestionExample.options,
      correctAnswer: 'Japanese yen',
    },
    responseBody: adminQuestionExample, successStatus: 201,
    notes: [
      'Text must contain 1–500 UTF-16 code units after trimming.',
      'Provide 2–10 options, each 1–200 UTF-16 code units after trimming, unique without case.',
      'correctAnswer must contain 1–200 UTF-16 code units after trimming and match one option without case.',
      'The admin response includes correctAnswer. The Location header points to the new public question resource.',
    ],
    responses: [{ status: 201, description: 'The created admin question, with a Location header.' }, badRequest, unauthorized, unsupportedMedia, internalError],
  },
  {
    id: 'update-question', title: 'Update a question', label: 'Update a question', group: 'Administration',
    method: 'PATCH', path: '/api/v1/questions/{id}', auth: true,
    description: 'Change one or more question fields while keeping the other values.',
    parameters: idParameter, requestBody: { text: 'What is the currency of Japan?' },
    responseBody: { ...adminQuestionExample, text: 'What is the currency of Japan?' }, successStatus: 200,
    notes: [
      'Supply at least one non-null field. Omitted or null fields keep their previous values.',
      'The merged question must be valid. Changing options may require updating correctAnswer in the same request.',
      'The same trimmed text, option count, uniqueness, and correct-answer rules as creation apply.',
    ],
    responses: [{ status: 200, description: 'The updated admin question, including correctAnswer.' }, badRequest, unauthorized, notFound, unsupportedMedia, internalError],
  },
  {
    id: 'delete-question', title: 'Delete a question', label: 'Delete a question', group: 'Administration',
    method: 'DELETE', path: '/api/v1/questions/{id}', auth: true,
    description: 'Remove a question from the bank using an admin bearer token.',
    parameters: idParameter, successStatus: 204,
    notes: ['A successful deletion returns HTTP 204 with no response body. Do not attempt to parse JSON.'],
    responses: [{ status: 204, description: 'Question deleted. No response body.' }, badRequest, unauthorized, notFound, internalError],
  },
]

export function buildEndpointUrl(baseUrl: string, endpoint: ApiEndpoint, questionId = exampleQuestionId): string {
  const encodedId = encodeURIComponent(questionId).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
  return `${baseUrl.trim().replace(/\/+$/, '')}${endpoint.path.replace('{id}', encodedId)}`
}

export function buildJavaScriptExample(baseUrl: string, endpoint: ApiEndpoint, questionId = exampleQuestionId): string {
  const lines: string[] = []
  if (endpoint.auth) lines.push(
    'const ADMIN_TOKEN = process.env.ADMIN_TOKEN',
    "if (!ADMIN_TOKEN) throw new Error('Set ADMIN_TOKEN to the token returned by admin login.')",
    '',
  )
  lines.push(`const response = await fetch(${JSON.stringify(buildEndpointUrl(baseUrl, endpoint, questionId))}, {`,
    `  method: ${JSON.stringify(endpoint.method)},`,
    '  headers: {',
    "    Accept: 'application/json',",
  )
  if (endpoint.auth) lines.push('    Authorization: `Bearer ${ADMIN_TOKEN}`,')
  if (endpoint.requestBody) lines.push("    'Content-Type': 'application/json',")
  lines.push('  },')
  if (endpoint.requestBody) {
    const body = JSON.stringify(endpoint.requestBody, null, 2).replaceAll('\n', '\n  ')
    lines.push(`  body: JSON.stringify(${body}),`)
  }
  lines.push('})', '', 'if (!response.ok) {', '  throw new Error(`Request failed: ${response.status} ${response.statusText}`)', '}', '')
  if (endpoint.successStatus === 204) lines.push("console.log('Question deleted (204 No Content).')")
  else lines.push('const data = await response.json()', 'console.log(data)')
  return lines.join('\n')
}

function bashQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function powershellQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export function buildShellExamples(baseUrl: string, endpoint: ApiEndpoint, questionId = exampleQuestionId): { shared?: string; powershell?: string; bash?: string } {
  const url = buildEndpointUrl(baseUrl, endpoint, questionId)
  if (endpoint.method === 'GET' && !url.includes("'")) {
    return { shared: `curl --fail-with-body --header 'Accept: application/json' --url '${url}'` }
  }

  const bash = [`curl --fail-with-body --request ${endpoint.method}`, `  --url ${bashQuote(url)}`, "  --header 'Accept: application/json'"]
  if (endpoint.auth) bash.push('  --header "Authorization: Bearer ${ADMIN_TOKEN}"')
  if (endpoint.requestBody) bash.push("  --header 'Content-Type: application/json'", `  --data-raw ${bashQuote(JSON.stringify(endpoint.requestBody, null, 2))}`)

  const powershell: string[] = []
  if (endpoint.requestBody) powershell.push(`$body = @'\n${JSON.stringify(endpoint.requestBody, null, 2)}\n'@`, '')
  const command = [`Invoke-RestMethod -Method ${endpoint.method}`, `  -Uri ${powershellQuote(url)}`,
    `  -Headers @{ Accept = 'application/json'${endpoint.auth ? '; Authorization = "Bearer $env:ADMIN_TOKEN"' : ''} }`]
  if (endpoint.requestBody) command.push("  -ContentType 'application/json'", '  -Body $body')
  powershell.push(command.join(' `\n'))
  return { powershell: powershell.join('\n'), bash: bash.join(' \\\n') }
}
