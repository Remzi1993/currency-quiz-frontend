# Testing Fundamentals

The frontend uses Vitest for unit, integration, rendered component and consumer contract tests, with a small Playwright browser suite above them. The [test strategy](../../testing-strategy.md) defines scope, risks, environments, responsibilities and entry/exit criteria, and records measured results and remaining evidence.

| Test type | Current evidence | Files |
|-----------|------------------|-------|
| Unit | API clients handle valid and malformed responses, HTTP failures, cancellation and timeouts. Form tests check validation boundaries and partial updates; storage tests cover corrupt data and blocked access. | [client.test.ts](../../../src/api/client.test.ts), [questionForm.test.ts](../../../src/admin/questionForm.test.ts), [quizStorage.test.ts](../../../src/composables/quizStorage.test.ts) |
| Integration | Real quiz logic and persistence collaborate with injected API functions. Session tests exercise expiry, refresh concurrency and stale responses. | [useQuiz.test.ts](../../../src/composables/useQuiz.test.ts), [adminSession.test.ts](../../../src/composables/adminSession.test.ts) |
| Rendered component | Vue Test Utils mounts `QuestionEditor` in jsdom, exercising validation feedback and emitted submissions. Only unsupported native dialog methods are substituted. | [QuestionEditor.test.ts](../../../src/components/QuestionEditor.test.ts) |
| Consumer contract | Requests and responses at the public quiz boundary are checked against schemas from the pinned shared OpenAPI file. This catches route, method and payload drift independently of the browser suite. | [client.contract.test.ts](../../../src/api/client.contract.test.ts) |
| Browser | Playwright covers quiz completion and reload, pending submissions, loading failure recovery, rate limits, and admin login and question CRUD. It runs the real frontend and HTTP client through Vite's proxy to a local fake API. | [frontend.spec.ts](../../../tests/e2e/frontend.spec.ts), [playwright.config.ts](../../../playwright.config.ts) |

The 126 migrated cases retain strict assertions, descriptive behaviour names and arrange–act–assert structure. Ten contract cases, seven component cases and six targeted validation cases bring the Vitest suite to 149 cases. Vitest replaces the Node test runner; `node:assert/strict` remains an assertion library in migrated tests. Fake clocks make timeout and expiry boundaries deterministic, and cleanup restores mocks and timers between cases.

V8 coverage includes the selected TypeScript modules and `QuestionEditor`, including files without tests. It excludes other Vue components, views and browser entry points, so it is not whole-application coverage. Gates require 90% lines/statements, 85% functions and 80% branches. The [configuration](../../../vitest.config.ts) produces HTML, LCOV and JSON summaries alongside JUnit test results. Uncovered branches guide additional scenarios; executed lines alone cannot establish strong assertions.

[Stryker](../../../stryker.config.json) mutates `questionForm.ts` to test whether assertions detect changed validation behaviour. Its 75% failure threshold and 85% target apply only to that module. A surviving mutant may expose a missing assertion, a missing input case or equivalent behaviour; inspect it before adding a test. Mutation score is not a percentage of application defects prevented.

Playwright gives every case a fresh browser context and a separately seeded API tenant, removed in fixture cleanup. Role and label selectors, retrying assertions and explicit control of pending HTTP responses avoid fixed sleeps. The suite uses two workers and zero retries, with traces and screenshots on failure. These measures reduce timing and shared-state risks; they do not establish a historical flakiness rate.

Run these commands from the frontend root in **PowerShell 7+ and Linux/Bash**, after the dependency and browser setup described in the [README](../../../README.md):

```sh
npm test
npm run test:coverage
npm run test:e2e
npm run test:mutation
```

The fake API provides isolated frontend acceptance evidence, not verification of the live backend, database, hosting or authentication security. Schema-based consumer checks are not consumer-driven contract exchange with provider verification; that remains backend follow-up work. No test-first development history or longitudinal quality trend is inferred from the current suite.
