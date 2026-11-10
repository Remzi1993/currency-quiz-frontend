# Frontend test strategy for DP3
- **Author:** Remzi Çavdar
- **AI disclosure:** I used OpenAI Codex to assist in drafting this document by analysing my codebase, identifying
  relevant implementations, and comparing my work against the AUAS BoKSA knowledge article. Codex helped structure and
  formulate the documentation based on these findings. I independently reviewed, verified, and edited the generated
  content to ensure it accurately reflects my work and understanding. I take full responsibility for the accuracy,
  completeness, and quality of this document.

This strategy covers the Currency Quiz Vue frontend. It supports DP3 DevOps & Testing by making the testing approach reproducible and reviewable. The supplied sprint document asks for practical evidence, research and reflection; the advanced criteria additionally require browser testing, contracts, quality measurements and a separate test environment. Implementing the frontend suite provides part of that evidence. A hosted CI run, real-provider verification and personal reflection still need to be recorded.

## Scope and risks

| Risk                                                          | Tests and priority                                                                                                                                           |
|---------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Incorrect scoring, duplicate submissions or lost saved rounds | High: quiz composable and storage integration tests; browser round completion, checked-answer reload and results restoration.                                |
| Invalid or leaked API data reaches the UI                     | High: client response validation and independent OpenAPI schema checks of public question/answer traffic.                                                    |
| Session/CSRF errors or incorrect admin payloads               | High: client/session tests, rendered editor validation, browser route protection and cookie-based CRUD. Real authorization remains a backend responsibility. |
| Slow responses, rate limiting or failed services              | High: fake-timer unit/integration tests; held HTTP responses, HTTP 500 recovery and HTTP 429 manual retry in the browser.                                    |
| Invalid edits or accidental answer replacement                | High: question-form boundary tests, component events and partial PATCH assertions.                                                                           |
| Theme, documentation or request examples regress              | Medium: theme, documentation metadata and Swagger request-interceptor tests.                                                                                 |

Production deployment, real database persistence, server security, load testing, visual regression and full browser/device coverage are outside this frontend change. The browser suite currently targets Chromium on desktop. These limits prevent a passing frontend suite from being presented as complete system verification.

## Test types and tool choices

Most cases exercise rules and collaborating modules directly. A smaller rendered component suite checks the editor, and a small browser suite covers critical journeys. This keeps browser startup and timing overhead away from the majority of checks, following the [practical test pyramid](https://martinfowler.com/articles/practical-test-pyramid.html).

| Layer             | Tool and evidence                                                                                                             | Dependency handling                                                                         |
|-------------------|-------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------|
| Unit              | Vitest: form rules, storage, clients, theme and request helpers                                                               | Injected fetch/storage/clock implementations; fake timers for deadlines.                    |
| Integration       | Vitest: real quiz state with persistence, JWT metadata restoration/renewal and contract-linked documentation                      | Real local collaborating modules; controlled API responses.                                 |
| Component         | Vue Test Utils, jsdom and Vitest: question-editor validation, accessibility state, focus, option changes and emitted payloads | Real Vue render/events; modal dialog methods shimmed because jsdom does not implement them. |
| Consumer contract | Ajv and formats validate the public client's methods, paths and JSON against the pinned shared OpenAPI file                   | Independent schemas rather than expectations copied only from client implementation.        |
| Browser           | Playwright: completion/reloads, pending submissions, load recovery, rate limiting, admin CRUD/login/logout and access renewal | Real HTTP through Vite's proxy to a local fake with per-test state.                         |
| Mutation          | Stryker with the Vitest runner: question-form validation only                                                                 | Mutated source in Stryker's temporary workspace; related tests selected per mutant.         |

Vitest fits the existing Vite/TypeScript/Vue setup and retains the existing strict assertions. Playwright supplies browser isolation, role/label selectors, automatic waiting and trace reports. Cypress would be an alternative; installing both adds maintenance without addressing another risk. Tool behaviour follows the [Vitest coverage guide](https://vitest.dev/guide/coverage.html), [Playwright best practices](https://playwright.dev/docs/best-practices) and [Stryker Vitest runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/).

## Environments and test data

| Environment                   | Configuration and data                                                                                                                                                                        | Status                                                                  |
|-------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| Development                   | `npm run dev`; developer API proxy defaults to `localhost:8080`, with developer-managed backend data.                                                                                         | Existing.                                                               |
| Automated frontend test       | Playwright owns `127.0.0.1:4173` and the fake API at `127.0.0.1:18080`. Test-mode API settings override developer settings; an occupied port fails startup. Vitest has no backend dependency. | Implemented locally and configured in CI.                               |
| Staging with the real backend | Separate non-production frontend origin, backend deployment and database; synthetic seeded questions, dedicated test admin and matching CORS/cookie settings.                                 | Required follow-up with the backend; not provisioned or exercised here. |
| Production                    | Existing Netlify/Render application and real question bank.                                                                                                                                   | Never targeted by this test suite.                                      |

The HTTP fake creates three synthetic questions for each test, keyed by a random tenant cookie. Each browser context gets separate cookies and localStorage. Test-only controls configure failures, hold/release answers and inspect recorded requests. Fixture teardown removes the tenant and closes its client; Playwright shuts down both owned services. Parallel tests therefore cannot alter one another's questions or login state. Credentials are fixed local fixture values with no production access.

The fake models public question/answer operations, four-field JWT metadata, cookie paths/HttpOnly/SameSite, Origin/CSRF checks and admin CRUD. Test controls can mark access expired while refresh remains usable, or expire both credentials. The browser regression reloads after forced access expiry, performs a user-requested write that renews access, checks that both cookies changed, then checks sign-in after forced refresh expiry. Renewal preserves CSRF. These are controlled response scenarios, not real JWT expiry calculations: the fake does not verify signatures, enforce a 24-hour clock deadline, detect replay or reproduce backend input validation. This is a controlled frontend browser integration environment, not a production-equivalent backend. For staging, seed a distinct question namespace per run and remove only records owned by that run in teardown, including after failures. Never copy production credentials or personal data.

## Contract boundary and remaining provider work

`src/api/client.contract.test.ts` reads the committed `shared/openapi/currency-quiz.v1.yaml`. It validates list/answer responses, the actual answer request body and the client's route/method selection, including UUIDs and forbidden extra answer fields. These checks fail quickly when consumer assumptions conflict with the pinned specification, while browser tests against a fake could reproduce the same incorrect assumption on both sides.

This is basic specification-based consumer contract testing. It does not publish a consumer-driven Pact or prove that a running provider obeys the specification. The next backend step is provider-side verification against this same pinned contract, or a consumer-generated Pact verified in backend CI. A provider change should be checked against consumer expectations before deployment; a coordinated contract update must update both repositories' submodule pins deliberately. Run the browser journeys against a disposable real backend/staging dataset before claiming full system E2E evidence.

## Entry and exit criteria and responsibilities

Entry requires Node.js 26, `npm ci`, the pinned initialized `shared/` submodule, an installed Chromium binary and free test ports. Test changes must identify the behaviour and risk being checked. Unit/component tests may use controlled dependencies; browser tests must own and clean their data.

| Gate                    | Acceptance criterion                                                                                                                                                                                                                                                                                                                                            |
|-------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Static checks and build | `npm run typecheck` and `npm run build` succeed. Strict TypeScript checks include tests and configurations; a separate lint gate is not configured.                                                                                                                                                                                                             |
| Regression tests        | All Vitest cases pass; no unhandled errors, focused tests or unexplained skips.                                                                                                                                                                                                                                                                                 |
| Scoped coverage         | At least 80% aggregate lines, statements, functions and branches across the configured scope. Each metric must pass; individual files need not each reach 80% (`perFile: false`). Threshold failure exits nonzero.                                                                                                                                              |
| Browser tests           | All Chromium journeys pass with zero retries. A failure is investigated, not hidden by increasing timeouts.                                                                                                                                                                                                                                                |
| Mutation                | At least 75% on `src/admin/questionForm.ts`; 85% is the improvement target. Review surviving and uncovered mutants rather than changing exclusions to make a gate pass.                                                                                                                                                                                         |
| Review and merge        | Review the risks, changed assertions and reports. After the first hosted run, configure branch rules to require `1. Tests and coverage`, `2. Type check`, `3. Production build`, `4. Browser tests` and `5. Mutation tests`. Their job IDs are `test`, `checks`, `build`, `e2e` and `mutation`. Configuring a workflow alone does not enforce merge protection. |

The maintainer owns test data, assertions, failure triage and reasoned gate changes. A reviewer checks whether the suite represents the changed risks and challenges weakened thresholds or unexplained exclusions. Backend work owns provider verification and staging data lifecycle. Learning-group feedback and the author's own reflection belong in the DP3 evidence; the repository cannot substitute for them.

## Coverage and mutation interpretation

`vitest.config.ts` explicitly includes API clients, form rules, composables, documentation helpers, Swagger request logic and `QuestionEditor.vue`. Other views, navigation, application bootstraps and visual components are not included in these percentages. Uncovered files inside the selected scope remain eligible for reporting. The 80% minimum applies to each aggregate metric across this scope, with `perFile: false`; it is not an 80% requirement for every file. This is a gate on selected executable logic, not a claim of whole-frontend coverage; browser results are reported separately.

Line/statement coverage measures execution, branch coverage measures exercised decisions, and function coverage measures called functions. None demonstrates that assertions would detect a bug. The mutation score measures detected artificial changes among valid mutants; Stryker counts killed and timed-out mutants as detected, includes survivors and uncovered mutants in the denominator, and excludes compile/runtime errors and ignored mutants. Inspect timeouts separately because a slow test is weaker evidence than a direct assertion failure. Scores depend on the selected files and mutation operators; 100% is not proof of correctness. See [Stryker mutation elements](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/).

The first question-form run killed 129 of 139 mutants (92.81%), with nine survivors and one uncovered mutant. It exposed two actionable assertion gaps: removing a trailing option from an otherwise unchanged list, and invalid question text when all other fields are valid. Six targeted regression cases now cover those behaviours. The rerun killed 131 of 139 mutants (94.24%), with seven survivors, one uncovered mutant and no timeouts or errors. Remaining candidates include redundant numeric-index checks and a defensive unreachable-answer guard; inspect their practical effect before adding artificial tests. An equivalent-looking mutant should be assessed, not automatically excluded.

Local results on 3 November 2026, using Vitest 5.1.0, Playwright 1.64.1 and Stryker 10.1.1:

| Check               | Result                                                             | Scope                                                                                                         |
|---------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| Vitest              | 149 passed across 12 files                                         | 126 migrated cases, 10 consumer contract cases, seven component cases and six mutation-driven boundary cases. |
| Coverage            | 96.22% lines, 93.57% statements, 89.51% branches, 94.18% functions | Selected modules listed above; all configured gates passed.                                                   |
| Playwright          | Five passed; repeated run 15/15 passed with zero retries           | Chromium against the isolated HTTP fake.                                                                      |
| Mutation            | 94.24%, up from 92.81%                                             | Question-form validation only.                                                                                |
| Static checks/build | Passed                                                             | Vue-aware application/config/test checking and production build.                                              |

After the rolling JWT migration on 10 November 2026, all 151 Vitest tests across 12 files and all six Chromium browser
journeys passed. The browser checks now include renewal of both cookies before a user-requested write and sign-in
after forced refresh expiry. Type checking, production build and the ten specification-based consumer contract cases
also passed. Coverage was 96.63% lines, 94.13% statements, 90.77% branches and 94.01% functions across the same selected
scope. Mutation testing was not rerun for this authentication change; the question-form score above remains historical.

An additional local smoke check on 10 November 2026 used headless Chromium, the real Vue frontend through Vite's
proxy, and the packaged Ktor JAR with disposable bcrypt credentials and temporary JSON storage. Environment settings
shortened access, refresh and absolute lifetimes to 2, 6 and 18 seconds. Five UI question creates at approximately
3, 7, 11, 15 and 17 seconds after sign-in succeeded. Seven user-triggered renewals in total, including question-list
loads after both sign-ins, replaced both HttpOnly cookies while preserving signed `auth_time` and `absolute_exp`.
Both final token expiries were capped by the original 18-second deadline. A request without CSRF returned 403; a
copied final refresh JWT returned 401 after the deadline. The UI returned to sign-in, a fresh login established a new
`auth_time`, and logout cleared both cookies. No browser JavaScript errors were reported. This was an ad hoc local
authentication smoke check, not a checked-in real-backend CI fixture or proof of a production deployment; the six
maintained Playwright journeys still use the isolated fake API.

These are local measurements. A separate local run limited to 12 tests deliberately failed all four 80% aggregate coverage thresholds and exited nonzero, confirming that the gate rejects insufficient coverage while preserving the full-suite reports. The configured GitHub workflow still needs an actual hosted run after the changes are pushed.

Other useful improvements are targeted tests for the currently uncovered question-bank revision helper, cancellation/error paths in the public client, and theme/storage fallback decisions. Expand measured UI scope when additional components gain meaningful tests. Raise thresholds after reviewing sustained results rather than imposing 100% coverage and encouraging trivial assertions.

## Automation reporting and flakiness

GitHub Actions runs on pushes to `main` and `dev`, including merges, on all pull requests, and on manual dispatch. Five jobs form a strict dependency chain: `test` (1. Tests and coverage) → `checks` (2. Type check) → `build` (3. Production build) → `e2e` (4. Browser tests) → `mutation` (5. Mutation tests). Each starts only after its predecessor succeeds; a failed or skipped stage prevents all later stages from running. The first stage collects coverage while Vitest executes tests and checks the 80% aggregate thresholds afterwards in the same run. Coverage is not a standalone check that can run before tests. Type checking and bundle validation follow, before browser startup and mutation analysis. Every stage uses a fresh workspace, recursive checkout of the pinned shared submodule, Node.js 26 with npm caching, and `npm ci`. Actions use the explicit release tags `checkout@v7.0.1`, `setup-node@v7.1.0` and `upload-artifact@v7.0.2`.

Within each test stage, Vitest parallelizes files, Playwright uses two workers with separate state, and Stryker uses two workers and per-test coverage to avoid rerunning unrelated cases. These runner optimizations do not change the sequential stage order. Workflows cancel obsolete runs for the same ref.

A local concurrent coverage/mutation run exposed a file-copy race: Stryker tried to copy a coverage temporary file after Vitest removed it. `stryker.config.json` now excludes generated coverage, reports, browser artifacts and build output from its sandbox. CI additionally isolates jobs in separate workspaces. The corrected mutation run passed; generated evidence is not an input to mutation testing.

JUnit/JSON results, coverage HTML/LCOV/JSON, Playwright HTML plus failure traces/screenshots and mutation HTML/JSON are retained as artifacts for 14 days. Each test stage uploads available reports and runs `scripts/test-summary.mjs` for its Actions summary even when its test command fails; downstream jobs remain skipped. Stage 3 uploads a successful `dist/` build as `currency-quiz-build`, also retained for 14 days. This artifact can exist when a later browser or mutation stage fails, so its presence does not establish pipeline acceptance. The build validates bundling without deploying; Playwright continues to use the separate Vite/fake-API environment rather than the production artifact. Inspect a failed trace or mutation report, then compare successive runs with the same scope and tool versions. A rising failure count, falling branch coverage or growing survivor count should lead to a concrete regression case and cause analysis. Historical trend aggregation is not implemented; save baseline/run links before artifact expiry.

Browser assertions wait for visible states, not arbitrary delays or network-idle heuristics. Pending answers are held by an explicit server control and released after disabled controls are asserted. Retry-After testing freezes/advances the browser date while ordinary timers continue, preventing the assertion from racing a real deadline. Shuffled questions are matched by their visible content rather than fixed order. Native quiz radios are visually clipped, so tests click their visible labels and assert the resulting checked state.

The five-case suite passed a three-repeat run with two workers and zero retries (15/15). This is a short reproducibility check, not proof that flakiness is absent. On an intermittent failure, inspect the trace and server records to distinguish selector, deadline, shared-state and external dependency causes; reproduce using `npx playwright test --repeat-each=3`. Keep failures visible. Any temporary quarantine needs an owner, issue and removal date, and must not silently count as passing critical coverage.

## DP3 evidence to collect

Run the commands in the [README](../README.md#testing-for-dp3), retain the reports and record the commit and tool versions. The implementation and strategy demonstrate a chosen standard and practical application (OR2); the tool comparison and limitations support the discussion of alternatives (OR1/AA2).

After pushing, save a permalink or recording of a hosted CI run, including one meaningful failed check and its fix. Add provider/staging results during backend work. Compare at least two reports before making claims about trends. Record learning-group feedback, resulting improvements and a personal reflection in Portflow. Describe actual AI assistance and personal review accurately, following the supplied sprint document; no feedback, reflection or successful hosted run is fabricated here.
