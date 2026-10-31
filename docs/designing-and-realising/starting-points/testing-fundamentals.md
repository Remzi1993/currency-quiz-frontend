# Testing Fundamentals

I test API handling and quiz logic without depending on a running backend. Integration tests check how quiz state and persistence work together.

| Topic | Current evidence | Files |
|-------|------------------|-------|
| Unit tests | API tests cover valid data, malformed responses, HTTP failures, network errors and timeouts. Storage tests include corrupt data, blocked access and failed writes. | [client.test.ts](../../../src/api/client.test.ts), [quizStorage.test.ts](../../../src/composables/quizStorage.test.ts) |
| Structure and names | Behaviour-based names explain each expectation. The storage round-trip test arranges saved state and memory storage, writes it, then asserts the restored state: arrange–act–assert. | [quizStorage.test.ts](../../../src/composables/quizStorage.test.ts) |
| Integration tests | `useQuiz` tests combine real quiz logic and storage helpers with stubbed API functions. Another test compares documentation metadata with the shared OpenAPI contract. These tests do not render Vue components. | [useQuiz.test.ts](../../../src/composables/useQuiz.test.ts), [apiReference.test.ts](../../../src/docs/apiReference.test.ts) |
| Test framework and results | Node's built-in `node:test` runner and `node:assert/strict` provide named results, assertion failures and pass/fail totals. Type checking includes the test files. | [package.json](../../../package.json), [tsconfig.test.json](../../../tsconfig.test.json) |
| Coverage | No coverage report is configured. High coverage would show code execution, but could still miss boundary cases or contain weak assertions. Interpreting an actual report remains missing evidence. | [package.json](../../../package.json) |

Run `npm test` and `npm run typecheck` from the frontend root (PowerShell 7+ and Bash).

Unit tests isolate rules; integration tests verify collaborating parts. I use integration tests for restoring a round because state and persistence must agree. End-to-end tests would exercise the browser with the real API; none are implemented. A test-first workflow is not established by the current files.
