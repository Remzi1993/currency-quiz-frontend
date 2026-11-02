import type {
  AdminQuestion, AnswerRequest, AnswerResponse, BrowserSessionResponse, CreateQuestionRequest,
  LoginRequest, PublicQuestion, TokenResponse, UpdateQuestionRequest,
} from '../../shared/generated/typescript/schema'

interface EndpointDetails {
  id: string
  title: string
  label: string
  group: 'Public quiz' | 'Administration'
  description: string
  auth: boolean
  browserSession?: 'create' | 'read' | 'delete' | 'refresh' | 'activity'
  notes: string[]
  parameters?: Array<{ name: string; description: string; required: boolean; example: string }>
}

type DocumentedOperation<
  Id extends string,
  Method extends 'GET' | 'POST' | 'PATCH' | 'DELETE',
  Path extends string,
  ResponseBody,
  Success extends number,
  Errors extends number,
  RequestBody = never,
> = EndpointDetails & {
  id: Id
  method: Method
  path: Path
  successStatus: Success
  responses: Array<{ status: Success | Errors; description: string }>
} & ([RequestBody] extends [never] ? { requestBody?: never } : { requestBody: RequestBody })
  & ([ResponseBody] extends [never] ? { responseBody?: never } : { responseBody: ResponseBody })

/** Generated models type the examples; contract tests check the maintained endpoint metadata against OpenAPI. */
export type ApiEndpoint =
  | DocumentedOperation<'list-questions', 'GET', '/api/v1/questions', PublicQuestion[], 200, 403 | 500>
  | DocumentedOperation<'get-question', 'GET', '/api/v1/questions/{id}', PublicQuestion, 200, 400 | 404 | 500>
  | DocumentedOperation<'check-answer', 'POST', '/api/v1/questions/{id}/answers', AnswerResponse, 200, 400 | 404 | 415 | 429 | 500, AnswerRequest>
  | DocumentedOperation<'login', 'POST', '/api/v1/auth/login', TokenResponse, 200, 400 | 401 | 415 | 429 | 500, LoginRequest>
  | DocumentedOperation<'create-session', 'POST', '/api/v1/auth/session', BrowserSessionResponse, 200, 400 | 401 | 403 | 415 | 429 | 500, LoginRequest>
  | DocumentedOperation<'get-session', 'GET', '/api/v1/auth/session', BrowserSessionResponse, 200, 401 | 403 | 500>
  | DocumentedOperation<'delete-session', 'DELETE', '/api/v1/auth/session', never, 204, 401 | 403 | 500>
  | DocumentedOperation<'refresh-session', 'POST', '/api/v1/auth/session/refresh', BrowserSessionResponse, 200, 401 | 403 | 429 | 500>
  | DocumentedOperation<'session-activity', 'POST', '/api/v1/auth/session/activity', BrowserSessionResponse, 200, 401 | 403 | 429 | 500>
  | DocumentedOperation<'create-question', 'POST', '/api/v1/questions', AdminQuestion, 201, 400 | 401 | 403 | 415 | 500, CreateQuestionRequest>
  | DocumentedOperation<'update-question', 'PATCH', '/api/v1/questions/{id}', AdminQuestion, 200, 400 | 401 | 403 | 404 | 415 | 500, UpdateQuestionRequest>
  | DocumentedOperation<'delete-question', 'DELETE', '/api/v1/questions/{id}', never, 204, 400 | 401 | 403 | 404 | 500>

export const exampleQuestionId = 'c72b3aab-633f-4268-88e7-c6ba1c3bb217'
export const publicQuestionExample: PublicQuestion = {
  id: exampleQuestionId,
  text: 'Which currency is used in Japan?',
  options: ['Chinese yuan', 'Japanese yen', 'South Korean won', 'Thai baht'],
}

const adminQuestionExample: AdminQuestion = { ...publicQuestionExample, correctAnswer: 'Japanese yen' }
const browserSessionExample: BrowserSessionResponse = {
  username: 'admin', expiresIn: 900, accessExpiresIn: 300, absoluteExpiresIn: 1800,
  csrfToken: 'a'.repeat(43),
}
const idParameter = [{
  name: 'id', required: true, example: exampleQuestionId,
  description: 'Question UUID in the URL. A malformed UUID returns 400; an unknown UUID returns 404.',
}]
const badRequest = { status: 400, description: 'Invalid JSON, fields, question ID, or resulting question.' } as const
const unauthorized = { status: 401, description: 'Invalid credentials or a missing, expired, or invalid admin session/token.' } as const
const forbidden = { status: 403, description: 'The origin is not trusted, or a cookie-authenticated write has a missing or invalid CSRF token.' } as const
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
    responseBody: { accessToken: 'YOUR_ADMIN_TOKEN', tokenType: 'Bearer', expiresIn: 300 }, successStatus: 200,
    notes: [
      'Limited to 5 requests per minute per client IP. Use HTTPS outside local development.',
      'expiresIn is the configured token lifetime in seconds (1–300). Access tokens last at most five minutes.',
      'Send the returned token as Authorization: Bearer YOUR_ADMIN_TOKEN for administration requests.',
      'Username must contain 1–100 characters and password 1–1,024 characters. Examples contain placeholders only.',
      'This bearer-token flow is for API clients. The website uses the separate HttpOnly browser-session endpoints below.',
    ],
    responses: [{ status: 200, description: 'The signed access token, Bearer token type, and lifetime in seconds.' }, badRequest, unauthorized, unsupportedMedia, rateLimited, internalError],
  },
  {
    id: 'create-session', title: 'Sign in with a cookie', label: 'Browser sign in', group: 'Administration',
    method: 'POST', path: '/api/v1/auth/session', auth: false, browserSession: 'create',
    description: 'Start the website’s admin session without exposing an authentication token to JavaScript.',
    requestBody: { username: 'YOUR_ADMIN_USERNAME', password: 'YOUR_ADMIN_PASSWORD' },
    responseBody: browserSessionExample, successStatus: 200,
    notes: [
      'The server sets HttpOnly access and refresh cookies. JSON contains username, remaining idle/access/absolute lifetimes, and a CSRF token; neither credential is exposed.',
      'Browsers must send credentials: include. Origin is sent automatically and must match ADMIN_CORS_ALLOWED_ORIGINS; terminal examples set it explicitly.',
      'Shares the 5 requests per minute per client IP login limit with bearer login. Use HTTPS outside local development.',
      'Use the same-origin /api proxy on Netlify. Keep the returned CSRF token in memory, then send it as X-CSRF-Token on admin writes.',
      'Access lasts five minutes, inactivity ends the session after 15 minutes, and the absolute session limit is 30 minutes. Limits can be configured lower.',
    ],
    responses: [{ status: 200, description: 'Session metadata plus Set-Cookie headers; no authentication token in JSON.' }, badRequest, unauthorized, forbidden, unsupportedMedia, rateLimited, internalError],
  },
  {
    id: 'get-session', title: 'Check the browser session', label: 'Browser session', group: 'Administration',
    method: 'GET', path: '/api/v1/auth/session', auth: true, browserSession: 'read',
    description: 'Restore admin metadata after a reload using the browser-managed cookies.',
    responseBody: browserSessionExample, successStatus: 200,
    notes: [
      'Send the existing session cookie with credentials: include. A missing, revoked, or expired session returns 401.',
      'Same-origin GET requests may omit Origin. If present, the origin must be explicitly trusted.',
      'Session responses use Cache-Control: no-store. Reading a session does not extend its expiry. The refresh cookie can restore metadata after access expires, without granting permission to change questions.',
    ],
    responses: [{ status: 200, description: 'Username, remaining idle/access/absolute lifetimes, and the session-bound CSRF token.' }, unauthorized, forbidden, internalError],
  },
  {
    id: 'delete-session', title: 'Sign out of the browser', label: 'Browser sign out', group: 'Administration',
    method: 'DELETE', path: '/api/v1/auth/session', auth: true, browserSession: 'delete',
    description: 'Revoke the browser session on the server and expire both HttpOnly cookies.',
    successStatus: 204,
    notes: [
      'Requires an access or current refresh cookie, a trusted Origin, and X-CSRF-Token from the most recent session response.',
      'A successful response is 204 with no body. If the request fails, do not claim the server session has been revoked; retry sign-out.',
      'Browser sessions are stored in memory. Restarting Render signs browser administrators out; bearer JWTs remain a separate flow.',
    ],
    responses: [{ status: 204, description: 'Session revoked and both cookies expired. No response body.' }, unauthorized, forbidden, internalError],
  },
  {
    id: 'refresh-session', title: 'Rotate the browser tokens', label: 'Refresh session', group: 'Administration',
    method: 'POST', path: '/api/v1/auth/session/refresh', auth: true, browserSession: 'refresh',
    description: 'Issue new access and refresh cookies without extending the idle or absolute session deadline.',
    responseBody: browserSessionExample, successStatus: 200,
    notes: [
      'Requires the refresh cookie, a trusted Origin, and X-CSRF-Token. Both credentials remain HttpOnly.',
      'A refresh token is single-use. Replaying a spent token revokes the session family, including its latest access cookie.',
      'Serialize refreshes across browser tabs with Web Locks. Do not automatically retry a timed-out refresh.',
      'Refresh and activity requests share a limit of 30 per minute per client IP. Background refresh does not count as user activity.',
    ],
    responses: [{ status: 200, description: 'New access and refresh cookies plus updated session metadata.' }, unauthorized, forbidden, rateLimited, internalError],
  },
  {
    id: 'session-activity', title: 'Record admin activity', label: 'Session activity', group: 'Administration',
    method: 'POST', path: '/api/v1/auth/session/activity', auth: true, browserSession: 'activity',
    description: 'Record user interaction and move the idle deadline, bounded by the original absolute session limit.',
    responseBody: browserSessionExample, successStatus: 200,
    notes: [
      'Requires a live access cookie, trusted Origin, and X-CSRF-Token. Refresh access first if accessExpiresIn is zero.',
      'Call only after user interaction. Polling, a visible tab, or an open editor alone must not keep a session alive.',
      'The frontend reports trusted input events at most once per 30 seconds. The backend enforces 15 idle minutes and 30 minutes overall.',
      'The server can verify the request and its session, but cannot independently prove a physical human action. The absolute limit still applies.',
    ],
    responses: [{ status: 200, description: 'Updated session metadata; the absolute deadline stays fixed.' }, unauthorized, forbidden, rateLimited, internalError],
  },
  {
    id: 'create-question', title: 'Create a question', label: 'Create a question', group: 'Administration',
    method: 'POST', path: '/api/v1/questions', auth: true,
    description: 'Add a question using an admin bearer token or the website’s cookie session.',
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
      'These examples use bearer authentication. A browser cookie session instead requires credentials: include, a trusted Origin, and X-CSRF-Token.',
    ],
    responses: [{ status: 201, description: 'The created admin question, with a Location header.' }, badRequest, unauthorized, forbidden, unsupportedMedia, internalError],
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
      'Cookie-authenticated updates also require a trusted Origin and X-CSRF-Token; bearer examples below remain supported.',
    ],
    responses: [{ status: 200, description: 'The updated admin question, including correctAnswer.' }, badRequest, unauthorized, forbidden, notFound, unsupportedMedia, internalError],
  },
  {
    id: 'delete-question', title: 'Delete a question', label: 'Delete a question', group: 'Administration',
    method: 'DELETE', path: '/api/v1/questions/{id}', auth: true,
    description: 'Remove a question using an admin bearer token or the website’s cookie session.',
    parameters: idParameter, successStatus: 204,
    notes: ['A successful deletion returns HTTP 204 with no response body. Do not attempt to parse JSON.', 'Cookie-authenticated deletion also requires a trusted Origin and X-CSRF-Token.'],
    responses: [{ status: 204, description: 'Question deleted. No response body.' }, badRequest, unauthorized, forbidden, notFound, internalError],
  },
]

export function buildEndpointUrl(baseUrl: string, endpoint: ApiEndpoint, questionId = exampleQuestionId): string {
  const encodedId = encodeURIComponent(questionId).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
  return `${baseUrl.trim().replace(/\/+$/, '')}${endpoint.path.replace('{id}', encodedId)}`
}

export function buildJavaScriptExample(baseUrl: string, endpoint: ApiEndpoint, questionId = exampleQuestionId): string {
  const lines: string[] = []
  if (endpoint.auth && !endpoint.browserSession) lines.push(
    'const ADMIN_TOKEN = process.env.ADMIN_TOKEN',
    "if (!ADMIN_TOKEN) throw new Error('Set ADMIN_TOKEN to the token returned by admin login.')",
    '',
  )
  if (endpoint.browserSession && !['create', 'read'].includes(endpoint.browserSession)) lines.push(
    `const sessionResponse = await fetch(${JSON.stringify(`${baseUrl.trim().replace(/\/+$/, '')}/api/v1/auth/session`)}, {`,
    "  method: 'GET',",
    "  credentials: 'include',",
    "  headers: { Accept: 'application/json' },",
    '})',
    'if (!sessionResponse.ok) throw new Error(`Request failed: ${sessionResponse.status} ${sessionResponse.statusText}`)',
    'const { csrfToken } = await sessionResponse.json()',
    '',
  )
  lines.push(`const response = await fetch(${JSON.stringify(buildEndpointUrl(baseUrl, endpoint, questionId))}, {`,
    `  method: ${JSON.stringify(endpoint.method)},`,
    `  credentials: '${endpoint.browserSession ? 'include' : 'omit'}',`,
    '  headers: {',
    "    Accept: 'application/json',",
  )
  if (endpoint.auth && !endpoint.browserSession) lines.push('    Authorization: `Bearer ${ADMIN_TOKEN}`,')
  if (endpoint.browserSession && !['create', 'read'].includes(endpoint.browserSession)) lines.push("    'X-CSRF-Token': csrfToken,")
  if (endpoint.requestBody) lines.push("    'Content-Type': 'application/json',")
  lines.push('  },')
  if (endpoint.requestBody) {
    const body = JSON.stringify(endpoint.requestBody, null, 2).replaceAll('\n', '\n  ')
    lines.push(`  body: JSON.stringify(${body}),`)
  }
  lines.push('})', '', 'if (!response.ok) {', '  throw new Error(`Request failed: ${response.status} ${response.statusText}`)', '}', '')
  if (endpoint.successStatus === 204) lines.push(`console.log('${endpoint.browserSession ? 'Signed out' : 'Question deleted'} (204 No Content).')`)
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
  if (endpoint.method === 'GET' && !endpoint.browserSession && !url.includes("'")) {
    return { shared: `curl --fail-with-body --header 'Accept: application/json' --url '${url}'` }
  }

  const bash = [`curl --fail-with-body --request ${endpoint.method}`, `  --url ${bashQuote(url)}`, "  --header 'Accept: application/json'"]
  if (endpoint.auth && !endpoint.browserSession) bash.push('  --header "Authorization: Bearer ${ADMIN_TOKEN}"')
  if (endpoint.browserSession) {
    bash.push('  --header "Origin: ${FRONTEND_ORIGIN}"')
    bash.push(endpoint.browserSession === 'create' ? '  --cookie-jar ./admin-cookies.txt' : '  --cookie ./admin-cookies.txt')
    if (!['create', 'read'].includes(endpoint.browserSession)) bash.push('  --header "X-CSRF-Token: ${CSRF_TOKEN}"')
    if (endpoint.browserSession === 'refresh') bash.push('  --cookie-jar ./admin-cookies.txt')
  }
  if (endpoint.requestBody) bash.push("  --header 'Content-Type: application/json'", `  --data-raw ${bashQuote(JSON.stringify(endpoint.requestBody, null, 2))}`)

  const powershell: string[] = []
  if (endpoint.requestBody) powershell.push(`$body = @'\n${JSON.stringify(endpoint.requestBody, null, 2)}\n'@`, '')
  const prefix = endpoint.browserSession && endpoint.browserSession !== 'delete' ? '$adminSession = ' : ''
  const command = [`${prefix}Invoke-RestMethod -Method ${endpoint.method}`, `  -Uri ${powershellQuote(url)}`,
    `  -Headers @{ Accept = 'application/json'${endpoint.auth && !endpoint.browserSession ? '; Authorization = "Bearer $env:ADMIN_TOKEN"' : ''}${endpoint.browserSession ? '; Origin = $env:FRONTEND_ORIGIN' : ''}${endpoint.browserSession && !['create', 'read'].includes(endpoint.browserSession) ? '; "X-CSRF-Token" = $adminSession.csrfToken' : ''} }`]
  if (endpoint.browserSession) command.push(endpoint.browserSession === 'create' ? '  -SessionVariable adminWebSession' : '  -WebSession $adminWebSession')
  if (endpoint.requestBody) command.push("  -ContentType 'application/json'", '  -Body $body')
  powershell.push(command.join(' `\n'))
  if (endpoint.browserSession === 'create') {
    powershell.unshift('# Set $env:FRONTEND_ORIGIN to an origin in ADMIN_CORS_ALLOWED_ORIGINS.', '# Keep $adminSession and $adminWebSession for the following requests.', '')
  }
  const bashIntro = endpoint.browserSession === 'create'
    ? '# Set FRONTEND_ORIGIN to an origin in ADMIN_CORS_ALLOWED_ORIGINS.\n# Save csrfToken from the response as CSRF_TOKEN for sign-out.\n# admin-cookies.txt contains a credential; keep it private and remove it after use.\n\n'
    : ''
  return { powershell: powershell.join('\n'), bash: bashIntro + bash.join(' \\\n') }
}
