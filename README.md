# Currency Quiz
[![Netlify Status](https://api.netlify.com/api/v1/badges/145cc2a1-785d-4c30-861f-ba99cd95a5d2/deploy-status)](https://app.netlify.com/projects/currency-quiz/deploys)

A public quiz frontend for `currency-quiz-backend`, built with Vue 3, TypeScript 6, Vite 8, and Bulma 1. Bulma's precompiled CSS provides the layout, controls, and components; no Sass compiler or CSS framework JavaScript is needed. The API client uses native `fetch` and imports named model types from the API contract in `shared/`.

Choose 10, 20, or all available questions and play a shuffled round. Each answer is checked once by the backend. The frontend shows feedback, question progress, correct and incorrect totals, a final score, and a review of your submitted answers. The public API returns correctness only, so an incorrect answer does not reveal the correct option. No account or admin interface is included.

Your preferred round size and current or completed round are saved automatically in versioned `localStorage`. Refreshing restores the same question order, position, selection, checked feedback, score, and rate-limit deadline before requesting new questions. Leaving a round or choosing another round clears that session while keeping your preferred round size; the welcome screen loads the current question bank. Invalid saved data is ignored, and unavailable browser storage falls back to an in-memory session. No credentials are stored.

## API documentation

Use the navigation to switch between the quiz at `/` and the documentation at `/documentation`. The Bulma navbar sits at the top on desktop and is fixed to the bottom below 1024px. Its mobile menu opens upward, closes on navigation, outside taps, or Escape, and supports keyboard focus. Content spacing and device safe-area padding keep the bottom bar clear of page controls. Documentation sections have their own `/documentation/:section` links, such as `/documentation/list-questions`. Vue Router uses browser history for clean URLs. Browsing the documentation preserves the quiz view with Vue's `KeepAlive`; saved rounds also survive page reloads.

The documentation follows the OpenAPI contract in `shared/` and covers all seven operations: list, retrieve, create, update, and delete questions; check an answer; and obtain an admin token. It includes copyable request examples for JavaScript, PowerShell 7+, and Bash, example JSON, response statuses, authentication, and rate limits. Public quiz JavaScript examples work in the browser; authenticated examples are labelled Node.js and read `process.env.ADMIN_TOKEN`. Shared GET terminal commands are labelled for both shells, while requests with bodies have separate PowerShell and Bash examples. Public contract links lead to the [currency-quiz-shared repository](https://github.com/Remzi1993/currency-quiz-shared), and specification links open its [OpenAPI YAML on GitHub](https://github.com/Remzi1993/currency-quiz-shared/blob/main/openapi/currency-quiz.v1.yaml). The local shared contract still supplies generated client types; the website no longer bundles a separate YAML download.

Reading the documentation needs no running backend. Its API base URL defaults to `VITE_API_BASE_URL`, or the frontend's origin when that setting is empty. Choosing another backend origin requires that backend to allow the frontend through CORS. Admin CRUD and login are documented with examples; the frontend does not collect admin credentials or provide live admin mutations.

The live explorer can list questions, retrieve one question, and check an answer against the editable API base URL. It displays the HTTP status, response body, and elapsed time, formatting JSON when possible and preserving other responses as text. Each button press sends one request with a 60-second timeout and no automatic retry. An actual HTTP `503` displays the Render startup explanation; other failures use ordinary error handling. The explorer never sends admin requests, and answer checks count towards the backend's submission rate limit.

The shared footer introduces the school project and its author, Remzi Çavdar, with his website, email addresses, and student number. It links to the API contract, backend, and frontend repositories with short explanations, the OpenAPI specification, and the project's MIT license. Repository and specification destinations are centralized in `src/projectLinks.ts` so documentation and footer links stay consistent.

## Run locally

Use Node.js 26 and npm. Initialize the contract submodule before installing dependencies.

**PowerShell 7+ and Linux/Bash:**

```sh
git submodule update --init --recursive
npm install
```

Copy the example configuration if you need to change the backend address.

**PowerShell 7+:**

```powershell
Copy-Item .env.example .env.local
```

**Linux/Bash:**

```bash
cp .env.example .env.local
```

Start the backend, then start the frontend.

**PowerShell 7+ and Linux/Bash:**

```sh
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`. By default, Vite forwards `/api` requests to `http://localhost:8080`. Set the backend's `CORS_ALLOWED_ORIGINS` to include the exact frontend origin: browser POST requests retain their `Origin` header through the proxy. `localhost` and `127.0.0.1` are different origins; use the address allowed by your backend.

The frontend displays loading, empty, and connection-error states, with a retry action. Answer errors preserve your selection and progress; rate-limit responses pause submission according to `Retry-After`.

## Backend configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_PROXY_TARGET` | `http://localhost:8080` | Backend origin for Vite's development `/api` proxy. |
| `VITE_API_BASE_URL` | Empty | Public backend origin used by the browser. Empty uses the frontend's origin. |

Restart Vite after changing environment variables. For a separately hosted backend, set `VITE_API_BASE_URL` to its origin, for example `https://api.example.com`. The backend must allow the frontend's origin through CORS. Values prefixed with `VITE_` are public and embedded at build time; never place credentials in them.

For production, either forward `/api` from the frontend host to the backend or set `VITE_API_BASE_URL` before building. Vite's development proxy is unavailable in the production build and in `vite preview`.

### Render startup handling

This experimental school project uses Render's free plan, so the backend may need up to a minute to wake. When loading questions, an explicit HTTP `503` triggers a startup notice and retries every five seconds, within a total 60-second window measured from the initial request. A `503` is treated as possible startup; it does not prove the service is waking. A successful response ends the wait, while any other error immediately uses the normal error state. After the window expires, the user can retry manually.

Network errors, timeouts, and other HTTP statuses do not trigger startup handling. The browser must be able to read the actual response through CORS; a CORS-blocked response appears as a generic network error. Answer submissions are never retried automatically. These behaviors are covered locally; a real Render cold start has not been verified.

## Checks and production build

**PowerShell 7+ and Linux/Bash:**

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`typecheck` checks the Vue application, configuration, and tests. `test` uses Node's built-in test runner and native TypeScript support to verify the API client, quiz state, saved-session handling, and documentation example serialization without a running backend. The `yaml` development dependency lets the documentation tests read the shared OpenAPI file and compare the documented operations, response codes, and authentication with the actual contract. It is not used in the browser bundle. These tests do not establish compatibility with a running backend. `build` type-checks and creates the static application in `dist/`; `preview` serves that build locally.

Run these checks after updating the shared submodule. Its generated declarations now export named models such as `PublicQuestion` and `AnswerResponse`, without the former `components` or `paths` types. The frontend consumes these committed declarations and validates incoming JSON at runtime; no contract generation or Java installation is needed in this project. Endpoint metadata is maintained in the frontend and checked against the OpenAPI YAML by the tests. `npm run dev` transpiles TypeScript without typechecking, so a working development server alone does not confirm that a production build will pass.

## Clean URLs and hosting

Vue Router uses `createWebHistory(import.meta.env.BASE_URL)`. Opening `/index.html` redirects to `/`; unmatched paths display the frontend's not-found page. New page navigation scrolls to the top, while browser Back and Forward navigation restore saved scroll positions.

The frontend host must serve `index.html` for frontend routes so a direct visit or refresh at `/documentation` or `/documentation/list-questions` can load the application. Vite's development server and `vite preview` provide this fallback locally; production hosting needs its own rewrite configuration.

The root [netlify.toml](netlify.toml) configures Netlify to run `npm run build` with Node.js 26 and publish `dist/`. It rewrites `/`, `/documentation`, and `/documentation/:section` to `index.html` with HTTP `200`, then serves `index.html` with HTTP `404` for unmatched paths so Vue can show the not-found page. Existing static assets are served normally because these rewrites are not forced. The existing HSTS header is retained.

For Netlify deployment, set `VITE_API_BASE_URL` in the build environment before building, or add a deliberate `/api` reverse-proxy rule before the page rewrites. The routing changes have been checked locally; a live Netlify deployment has not been verified.

## Code structure

- `src/App.vue` and `src/components/`: application shell, navigation, shared instructions, and reusable visual components.
- `src/components/AppNavbar.vue`: responsive Bulma navbar and Vue-managed mobile menu; no additional navigation dependency.
- `src/components/AppFooter.vue`: large responsive footer with project repositories, MIT licensing, and author/contact information.
- `src/components/CurrencyGlobe.vue`: front-page SVG globe with five enlarged currency symbols (`$`, `€`, `¥`, `£`, and `Fr.`) in decreasing sizes, without currency-code labels. Yen and renminbi share a single `¥` symbol.
- `public/favicon.svg`: dollar sign inside a circle, shared by the browser favicon and the navbar image. Both point to `/favicon.svg`, so updating this single file updates both uses.
- `src/projectLinks.ts`: shared GitHub repository and OpenAPI specification URLs used by the documentation and footer.
- `src/router.ts`: Vue Router history routes, the `/index.html` redirect, not-found handling, and navigation scroll behavior.
- `src/views/QuizView.vue`: quiz screens and interaction with the session composable.
- `src/views/ApiDocsView.vue`: API reference, code examples, contract links, and public request explorer.
- `src/views/NotFoundView.vue`: unmatched-route page with navigation back to the application.
- `src/docs/apiReference.ts`: endpoint metadata and typed request/response examples, plus JavaScript and shell example builders.
- `src/composables/useQuiz.ts`: session state, shuffling, submission, scoring, and retry handling.
- `src/composables/quizStorage.ts`: versioned browser storage and saved-session validation.
- `src/api/client.ts`: native `fetch` requests using generated model types, response validation, timeouts, and API errors.
- `src/style.css`: application styling layered over Bulma's CSS.
- `netlify.toml`: production build settings, frontend route rewrites, HTTP 404 fallback, and HSTS response header for Netlify.
- `shared/openapi/currency-quiz.v1.yaml`: API contract; `shared/generated/typescript/schema.d.ts` supplies the client types. Update the shared contract through its own repository rather than editing generated types.

TypeScript uses `target: "ESNext"` and `lib: ["ESNext", "DOM", "DOM.Iterable"]` for the browser application. DOM libraries supply browser APIs such as `document` and `fetch`; they are needed alongside the latest JavaScript definitions. Vite also targets `esnext`, and the module-preload polyfill is disabled. The application assumes current browsers and adds no legacy-browser compatibility layer.

## Continuous integration

The [Frontend CI workflow](.github/workflows/ci.yml) runs on pushes, pull requests, and manual Actions runs. It checks out the pinned `shared/` submodule, installs locked dependencies with Node.js 26, then runs type checking → tests → build. A failure prevents later steps from running. The workflow builds the application without deploying it or changing Netlify settings. See [CI/CD Basics](docs/managing-and-collaborating/starting-points/ci-cd-basics.md) for the workflow structure, stage order and log diagnosis.

Actions are pinned to full commit IDs with release-version comments; update both together when upgrading. After committing and pushing the workflow, open **Actions → Frontend CI** to inspect a run. Manual runs become available from the default branch. To require successful checks before merging, add its `checks` status to the branch ruleset after the first run. Netlify deployment gates are configured separately.

Run the same checks from the frontend root in **PowerShell 7+ and Linux/Bash**:

```sh
git submodule update --init --recursive
npm ci
npm run typecheck
npm test
npm run build
```
