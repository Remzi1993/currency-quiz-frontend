# Architecture and Design Patterns

The frontend separates rendering, quiz state, HTTP requests and browser persistence. A view can use quiz behaviour without handling request paths or storage formats itself.

## ADR-001: Keep quiz state behind a composable and HTTP client

**Status:** Implemented; recorded retrospectively on 31 October 2026. Stakeholder review of this record is not documented.

**Context:** The application has one quiz flow and separate API documentation views. Loading, scoring, retries and restoring progress need tests without a running backend.

**Decision:** Keep shared layout in `App.vue`, page rendering in views, quiz behaviour in `useQuiz`, HTTP handling in `client.ts` and persistence in `quizStorage.ts`. Inject API functions, time, randomness and storage where tests need control.

**Alternatives:** Putting Fetch calls and persistence directly in the view would mix rendering with transport and storage. A global state container could help several views edit the same state, but the current quiz has one owner. A generic repository/service/event hierarchy would add more concepts than this flow needs.

**Consequences:** Views depend on a small quiz interface, and tests can control failures and timing. The composable still depends on Vue and the concrete `ApiError` type. It also handles several state transitions; if it grows further, I should split responsibilities around actual behaviours rather than introduce abstractions in advance.

The ADR records context, a decision and its consequences following [Nygard's lightweight approach](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

## Implementation evidence

| Choice | Why it helps | Evidence |
|--------|--------------|----------|
| Logical layers | The view renders state, the composable coordinates a round, and the client communicates with the API. | [QuizView.vue](../../../src/views/QuizView.vue), [useQuiz.ts](../../../src/composables/useQuiz.ts), [client.ts](../../../src/api/client.ts) |
| Small HTTP facade | `loadQuestions` and `submitAnswer` hide paths, serialization, response checks and error mapping behind simple operations. This follows the [Facade idea](https://refactoring.guru/design-patterns/facade). | [client.ts](../../../src/api/client.ts) |
| Factory function and injected dependencies | `createQuizApi` creates a configured client with replaceable Fetch. `useQuiz` accepts service substitutes instead of requiring real network requests in tests. | [client.test.ts](../../../src/api/client.test.ts), [useQuiz.test.ts](../../../src/composables/useQuiz.test.ts) |
| Separate persistence | Storage validation and serialization stay outside the view, and blocked storage can be handled independently. | [quizStorage.ts](../../../src/composables/quizStorage.ts) |

## Refactoring evidence and limits

Commit `22d18eb` replaced `openapi-fetch` and generated endpoint types with a Fetch wrapper and named DTOs. The `loadQuestions`/`submitAnswer` boundary stayed stable, protecting the quiz logic from the transport change. Inspect it with `git show 22d18eb -- src/api/client.ts` (PowerShell 7+ and Bash).

The trade-off is concrete: one client dependency was removed, but generated endpoint/path typing was lost. The wrapper now owns those paths and runtime checks. This is a limited refactoring example; the original frontend already had separate views, a composable and a client.

Run `npm test` and `npm run typecheck` from the frontend root (PowerShell 7+ and Bash). The tests demonstrate dependency substitution and state/storage integration; they do not render the complete browser-to-backend flow.

For a non-technical reader: the screen displays the quiz, a separate part tracks the round, and another part talks to the quiz service. This explanation is prepared for review; recorded stakeholder feedback and a substantial tightly coupled-to-layered refactor remain missing evidence.
