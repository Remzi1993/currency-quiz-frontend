import { randomUUID } from 'node:crypto'
import { test as base, expect, type APIRequestContext } from '@playwright/test'
import type { ApiScenario, ApiState } from './seed.ts'

interface TestApi {
  configure: (scenario: ApiScenario) => Promise<void>
  state: () => Promise<ApiState>
}

export const test = base.extend<{ testApi: TestApi }>({
  testApi: [async ({ request, context }, use) => {
    const tenant = randomUUID()
    const control = (method: Parameters<APIRequestContext['fetch']>[1]) => request.fetch(
      'http://127.0.0.1:18080/__test__/tenant',
      { ...method, headers: { 'x-e2e-tenant': tenant } },
    )
    const setup = await control({ method: 'POST' })
    expect(setup.status()).toBe(201)
    await context.addCookies([{ name: 'e2e_tenant', value: tenant, url: 'http://127.0.0.1:4173', sameSite: 'Strict' }])
    try {
      await use({
        configure: async (scenario) => {
          expect((await control({ method: 'PATCH', data: scenario })).status()).toBe(204)
        },
        state: async () => {
          const response = await control({ method: 'GET' })
          expect(response.status()).toBe(200)
          return response.json() as Promise<ApiState>
        },
      })
    } finally {
      expect((await control({ method: 'DELETE' })).status()).toBe(204)
    }
  }, { auto: true }],
})

export { expect }
