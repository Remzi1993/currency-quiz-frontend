import SwaggerUI from 'swagger-ui'
import 'swagger-ui/dist/swagger-ui.css'
import './swagger.css'
import contractUrl from '../../shared/openapi/currency-quiz.v1.yaml?url'
import { prepareSwaggerRequest } from './requests.ts'

const root = document.documentElement
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
function applySwaggerTheme() {
  const dark = root.dataset.theme === 'dark' || (root.dataset.theme !== 'light' && systemTheme.matches)
  root.classList.toggle('dark-mode', dark)
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = dark ? '#111b17' : '#f6f7f2'
  }
}
applySwaggerTheme()
systemTheme.addEventListener('change', applySwaggerTheme)

const originHint = document.getElementById('swagger-origin')
if (originHint) originHint.textContent = window.location.origin

const status = document.getElementById('swagger-status')
let startupFailed = false
try {
  SwaggerUI({
    dom_id: '#swagger-ui',
    url: contractUrl,
    layout: 'BaseLayout',
    deepLinking: true,
    filter: true,
    displayRequestDuration: true,
    showCommonExtensions: true,
    tryItOutEnabled: false,
    supportedSubmitMethods: ['get', 'post', 'patch', 'delete'],
    withCredentials: true,
    persistAuthorization: false,
    queryConfigEnabled: false,
    validatorUrl: 'none',
    // Keep CLI examples useful while the interceptor leaves browser-owned headers alone.
    showMutatedRequest: false,
    parameterMacro: (_operation, parameter) => parameter.in === 'header' && String(parameter.name).toLowerCase() === 'origin'
      ? window.location.origin : parameter.default,
    requestInterceptor: (request) => prepareSwaggerRequest(request, window.location.origin),
    onComplete() { if (status && !startupFailed) status.hidden = true },
  })
} catch (cause) {
  startupFailed = true
  console.error('Swagger UI initialization failed:', cause instanceof Error ? cause.message : 'Unknown initialization error')
  if (status) {
    status.hidden = false
    status.textContent = 'Swagger UI could not start. Reload this page or return to the API documentation.'
    status.setAttribute('role', 'alert')
  }
}
