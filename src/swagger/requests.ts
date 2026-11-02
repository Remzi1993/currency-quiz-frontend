import type SwaggerUI from 'swagger-ui'

/** Swagger's fields cannot override browser-managed Origin or HttpOnly cookies. */
export function prepareSwaggerRequest(request: SwaggerUI.Request, origin: string): SwaggerUI.Request {
  if (typeof request.url !== 'string') throw new TypeError('The Swagger request URL is missing.')
  const target = new URL(request.url, origin)
  if (target.origin !== origin || target.username || target.password) {
    throw new Error('Use this website’s /api proxy to send Swagger requests.')
  }
  const headers = new Headers(request.headers as HeadersInit | undefined)
  for (const name of ['Origin', 'Cookie', 'Cookie2', 'Host', 'Referer']) headers.delete(name)
  const isApi = target.pathname.startsWith('/api/v1/')
  if (!isApi) {
    headers.delete('Authorization')
    headers.delete('X-CSRF-Token')
  }
  request.headers = Object.fromEntries(headers)
  request.credentials = isApi ? 'include' : 'omit'
  request.redirect = 'error'
  const timeout = AbortSignal.timeout(60_000)
  request.signal = request.signal instanceof AbortSignal ? AbortSignal.any([request.signal, timeout]) : timeout
  return request
}
