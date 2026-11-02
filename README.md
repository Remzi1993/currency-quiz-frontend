# Currency Quiz
[![Netlify Status](https://api.netlify.com/api/v1/badges/145cc2a1-785d-4c30-861f-ba99cd95a5d2/deploy-status)](https://app.netlify.com/projects/currency-quiz/deploys)

A public quiz frontend for `currency-quiz-backend`, built with Vue 3, TypeScript 6, Vite 8, and Bulma 1. Bulma's precompiled CSS provides the layout, controls, and components; no Sass compiler or CSS framework JavaScript is needed. The API client uses native `fetch` and imports named model types from the API contract in `shared/`.

Choose 10, 20, or all available questions and play a shuffled round. Each answer is checked once by the backend. The frontend shows feedback, question progress, correct and incorrect totals, a final score, and a review of your submitted answers. The public API returns correctness only, so an incorrect answer does not reveal the correct option. Playing needs no account; the separate admin area manages the question bank.

Your preferred round size and current or completed round are saved automatically in versioned `localStorage`. Refreshing restores the same question order, position, selection, checked feedback, score, and rate-limit deadline before requesting new questions. Leaving a round or choosing another round clears that session while keeping your preferred round size; the welcome screen loads the current question bank. Invalid saved data is ignored, and unavailable browser storage falls back to an in-memory session. No credentials are stored.

## Appearance

The navbar's appearance selector offers **Light**, **Dark**, and **System**. System is the default and follows the operating system's colour preference, including changes while the page is open. An explicit Light or Dark choice is saved in `localStorage` under `currency-quiz.theme.v1`; choosing System removes that override. The selector remains visible beside the menu button in the mobile bottom navbar.

Bulma's built-in themes and CSS `color-scheme` / `light-dark()` style the quiz, documentation, navigation, forms, feedback, and admin dialogs. The existing green palette is retained in both modes. `public/theme-init.js` restores a saved choice before the app renders, then `useTheme` keeps the selector, OS preference, and browser theme colour in sync. This uses the existing Vue/Bulma setup without an additional theme library or Sass compiler.

## API documentation

Use the navigation to switch between the quiz at `/` and the documentation at `/documentation`. The Bulma navbar sits at the top on desktop and is fixed to the bottom below 1024px. Its mobile menu opens upward, closes on navigation, outside taps, or Escape, and supports keyboard focus. Content spacing and device safe-area padding keep the bottom bar clear of page controls. Documentation sections have their own `/documentation/:section` links, such as `/documentation/list-questions`. Vue Router uses browser history for clean URLs. Browsing the documentation preserves the quiz view with Vue's `KeepAlive`; saved rounds also survive page reloads.

The documentation follows the OpenAPI contract in `shared/` and covers public quiz operations, question administration, bearer login, and browser session login/read/refresh/activity/logout. It includes copyable request examples for JavaScript, PowerShell 7+, and Bash, example JSON, response statuses, authentication, and rate limits. Public quiz JavaScript examples work in the browser; bearer examples use Node.js and `process.env.ADMIN_TOKEN`, while browser-session examples use cookie credentials and CSRF protection. Shared GET terminal commands are labelled for both shells, while requests with bodies have separate PowerShell and Bash examples. Public contract links lead to the [currency-quiz-shared repository](https://github.com/Remzi1993/currency-quiz-shared), and specification links open its [OpenAPI YAML on GitHub](https://github.com/Remzi1993/currency-quiz-shared/blob/main/openapi/currency-quiz.v1.yaml). The pinned local contract supplies generated client types and the YAML asset used by Swagger UI.

Reading the documentation needs no running backend. Its API base URL defaults to `VITE_API_BASE_URL`, or the frontend's origin when that setting is empty. Choosing another backend origin requires that backend to allow the frontend through CORS. Admin CRUD and login are documented with examples; the documentation explorer does not collect admin credentials or send admin mutations.

The live explorer can list questions, retrieve one question, and check an answer against the editable API base URL. It displays the HTTP status, response body, and elapsed time, formatting JSON when possible and preserving other responses as text. Each button press sends one request with a 60-second timeout and no automatic retry. An actual HTTP `503` displays the Render startup explanation; other failures use ordinary error handling. The explorer never sends admin requests, and answer checks count towards the backend's submission rate limit.

The shared footer introduces the school project and its author, Remzi Çavdar, with his website, email addresses, and student number. It links to the API contract, backend, and frontend repositories with short explanations, the OpenAPI specification, and the project's MIT license. Repository and specification destinations are centralized in `src/projectLinks.ts` so documentation and footer links stay consistent.

### Swagger UI

Choose **Swagger UI** on the documentation page, or open `/swagger/`. It is a separate HTML entry point built by Vite, with a normal navigation link and no Vue Router route. Swagger's JavaScript and CSS load only on that page. It supports operation filtering, schema browsing, explicit **Try it out → Execute**, and shareable operation fragments such as `/swagger/#/Quiz/listQuestions`. The page follows the saved Light/Dark preference or the system theme and links back to the Vue documentation.

Swagger reads `shared/openapi/currency-quiz.v1.yaml` from the checked-out submodule; Vite emits that exact file as a versioned build asset. Updating the submodule and rebuilding updates Swagger without maintaining a second specification. Its server URL `/` uses this website's `/api` proxy, regardless of the Vue explorer's editable API base URL. Run the backend and `npm run dev` to execute requests locally; `npm run preview` can render Swagger but does not provide the development API proxy. On Netlify, the existing API proxy handles these requests without adding Node.js or Swagger to the backend.

For cookie authentication, sign in in the admin workspace or execute `POST /api/v1/auth/session`. Execute `GET /api/v1/auth/session` and put its `csrfToken` into **Authorize → adminCsrf** before authenticated writes. Leave **adminCookie** and **adminRefresh** empty: the browser manages HttpOnly cookies. Swagger sends credentials through the same-origin proxy and removes user-entered `Origin` and `Cookie` headers so the browser supplies the real values. The Origin parameter is documentation for other clients; editing it cannot change a browser's origin. The backend must allow the frontend's exact origin. Alternatively, API clients can obtain a bearer token with `POST /api/v1/auth/login` and enter it under **adminBearer**.

Authorization values are kept in memory and clear on reload. Swagger does not renew access, report activity, or retry requests automatically. Use session refresh explicitly when needed, then retrieve the current CSRF token again. Avoid simultaneous manual refreshes in multiple tabs because refresh-token reuse revokes the session family. The backend enforces the existing 5-minute access, 15-minute inactivity, and 30-minute absolute limits. Requests time out after 60 seconds; a `503` can indicate Render startup, while other failures require ordinary troubleshooting. Executed admin changes affect the real backend's question bank.

The `swagger-ui` runtime dependency provides the standalone explorer; `@types/swagger-ui` checks its configuration and request interceptor. React and React DOM are pinned together to 18.3.1 under Swagger because its current browser entry point uses the React 18 `react-dom.createRoot` export; allowing its broad dependency ranges to select React DOM 19 prevents it from rendering. The `@swagger-api/apidom-reference` override selects patched `minimatch` 11 rather than its vulnerable transitive version. Recheck these overrides when upgrading Swagger. At installation, `npm audit` still reports three low-severity entries from one unpatched upstream [deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). The page uses only the bundled contract, disables query-string configuration and the external validator, and blocks requests to other origins. These restrictions do not resolve the dependency advisory; review it when updating dependencies.

## Question administration

Choose **Admin** in the navbar or open `/admin/login`. Sign in with the backend's configured `ADMIN_USERNAME` and `ADMIN_PASSWORD`; credentials do not belong in frontend configuration or source code. `/admin` checks the backend's HttpOnly cookie session and redirects to sign-in otherwise. The backend authorises every write and validates Origin and CSRF; route guards do not replace those checks. Bearer JWT login remains available to other API clients.

The question bank lists all questions and supports searching question text, options, or UUIDs. Use **Create question**, the pencil button to edit, or the bin button to open a deletion confirmation. New questions appear at the end of the list, matching the backend's order, with a green confirmation. The table becomes a list of cards on small screens. Refresh fetches the latest bank without clearing an active search.

Questions require 1–500 characters, 2–10 distinct answer options of 1–200 characters each, and a selected correct answer. Input is trimmed and options are compared without case. Existing correct answers are hidden by the API, including for authenticated list requests. Text-only edits can keep the stored answer; changing options requires choosing the correct answer again. Updates send only changed fields. Confirmed admin changes refresh the cached public bank when returning to the welcome screen, while active quiz rounds and results keep their saved question snapshot.

The browser manages two host-only HttpOnly cookies: access on `/api/v1`, and refresh on `/api/v1/auth/session`. Neither authentication credential is returned in JSON or saved by JavaScript. The frontend keeps only username, deadlines, and the CSRF token in memory, and removes the old `currency-quiz.admin-session.v1` storage key. Reloading restores metadata through `GET /api/v1/auth/session`; cookie acceptance is checked after login.

Access lasts at most **5 minutes**. The server requires login again after **15 minutes without activity**, or **30 minutes overall**. Before a user-requested operation, the frontend renews access if needed. Refresh rotates both credentials; spent-token reuse revokes the family. Refresh and metadata reads do not reset inactivity. Trusted pointer, keyboard, input, and scroll events in the visible admin workspace report activity at most once per 30 seconds; there is no background renewal timer. Browser Web Locks serialize rotation, login, and logout across tabs, with a server recheck after waiting. Browsers without Web Locks only coalesce within a tab, so conflicting rotations can require a new login.

Sign-out revokes the family before clearing local state; a failed sign-out displays a retry message. Expiry and `401` clear the interface session. Render restarts/spin-downs clear the process-local store. Login honours `Retry-After`; only an actual `503` shows the Render startup explanation. Login, refresh, and writes are never automatically retried. After an uncertain write, refresh the list before retrying. The rationale and remaining security work are in the backend's [secure coding practices](https://github.com/Remzi1993/currency-quiz-backend/blob/main/docs/designing-and-realising/deepening/secure-coding-practices.md).

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

Open the local URL printed by Vite, normally `http://localhost:5173`. Vite forwards `/api` to `http://localhost:8080`. Set the backend's `ADMIN_CORS_ALLOWED_ORIGINS=http://localhost:5173`, `AUTH_COOKIE_SECURE=false` for local HTTP only, and keep `AUTH_COOKIE_SAME_SITE=Strict`. POST requests retain Origin through the proxy. `localhost` and `127.0.0.1` are different origins; allow the exact address Vite prints. Keep `VITE_API_BASE_URL` empty.

The frontend displays loading, empty, and connection-error states, with a retry action. Answer errors preserve your selection and progress; rate-limit responses pause submission according to `Retry-After`.

## Backend configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_PROXY_TARGET` | `http://localhost:8080` | Backend origin for Vite's development `/api` proxy. |
| `VITE_API_BASE_URL` | Empty | Public backend origin used by the browser. Empty uses the frontend's origin. |

Restart Vite after changing environment variables. Keep `VITE_API_BASE_URL` empty for the same-origin cookie flow. Direct cross-site administration requires explicit credentialed CORS and `SameSite=None; Secure`, and may still be blocked by browser policies. Values prefixed with `VITE_` are public and embedded at build time; never place credentials in them.

For production, use the same-origin Netlify `/api` proxy configured below. Vite's development proxy is unavailable in the production build and in `vite preview`.

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

`typecheck` checks the Vue application, standalone Swagger entry point, configuration, and tests. `test` uses Node's built-in test runner and native TypeScript support to verify the public and admin API clients, quiz state, saved-session handling, theme preferences and OS changes, cookie session restoration and expiry, refresh rotation and concurrency, question-form validation and partial updates, documentation example serialization, and Swagger's credential/header/origin handling without a running backend. The `yaml` development dependency lets the documentation tests read the shared OpenAPI file and compare the documented operations, response codes, and authentication with the actual contract. It is not used in the browser bundle. These tests do not establish compatibility with a running backend. `build` type-checks and creates the static application and `dist/swagger/index.html`; `preview` serves that build locally. Swagger's larger bundle is separate from the quiz bundle.

Run these checks after updating the shared submodule. Its generated declarations now export named models such as `PublicQuestion` and `AnswerResponse`, without the former `components` or `paths` types. The frontend consumes these committed declarations and validates incoming JSON at runtime; no contract generation or Java installation is needed in this project. Endpoint metadata is maintained in the frontend and checked against the OpenAPI YAML by the tests. `npm run dev` transpiles TypeScript without typechecking, so a working development server alone does not confirm that a production build will pass.

## Clean URLs and hosting

Vue Router uses `createWebHistory(import.meta.env.BASE_URL)`. Opening `/index.html` redirects to `/`; unmatched paths display the frontend's not-found page. New page navigation scrolls to the top, while browser Back and Forward navigation restore saved scroll positions.

The frontend host must serve `index.html` for frontend routes so a direct visit or refresh at `/documentation` or `/documentation/list-questions` can load the application. Vite's development server and `vite preview` provide this fallback locally; production hosting needs its own rewrite configuration.

The [public/netlify.toml](public/netlify.toml) file sets the build command, `dist/` publish directory, headers, API proxy, standalone Swagger page, and frontend routes; `.nvmrc` selects Node.js 26. In Netlify's build settings, set **Package directory** to `public` and leave **Base directory** at the repository root so Netlify discovers this configuration and runs npm against the root `package.json`. Build command `npm run build` and publish directory `dist` are relative to that base. Copying the file into the published site alone does not activate its settings; Netlify must discover it during the build. See [Netlify's build configuration documentation](https://docs.netlify.com/build/configure-builds/overview/).

The forced `/api/*` rewrite precedes page fallbacks and targets `https://currencyquiz-backend.onrender.com/api/:splat`, keeping cookies first-party for the frontend host. `/swagger` redirects to `/swagger/`, which serves `swagger/index.html` independently of Vue Router. Existing static assets are served normally; unmatched pages return the frontend's 404 view. Keep these rules in this one configuration rather than adding a conflicting `public/_redirects` file.

For deployment, unset or empty Netlify's `VITE_API_BASE_URL` and configure the package/base directories above. On Render set `ADMIN_CORS_ALLOWED_ORIGINS` to the exact frontend origin, `AUTH_COOKIE_SECURE=true`, `AUTH_COOKIE_SAME_SITE=Strict`, `JWT_TOKEN_TTL_SECONDS=300`, `ADMIN_SESSION_IDLE_SECONDS=900`, and `ADMIN_SESSION_ABSOLUTE_SECONDS=1800`. Public `CORS_ALLOWED_ORIGINS=*` can remain. Apply these settings in the hosting dashboards before deploying. Local checks do not establish a successful live Netlify/Render deployment.

## Code structure

- `src/App.vue` and `src/components/`: application shell, navigation, shared instructions, and reusable visual components.
- `src/components/AppNavbar.vue`: responsive Bulma navbar and Vue-managed mobile menu; no additional navigation dependency.
- `src/components/ThemeSelector.vue` and `src/composables/useTheme.ts`: accessible appearance selector, persisted overrides, and live system-theme updates.
- `public/theme-init.js`: early appearance restoration before the app renders; copied directly into the production build.
- `src/components/AppFooter.vue`: large responsive footer with project repositories, MIT licensing, and author/contact information.
- `src/components/CurrencyGlobe.vue`: front-page SVG globe with five enlarged currency symbols (`$`, `€`, `¥`, `£`, and `Fr.`) in decreasing sizes, without currency-code labels. Yen and renminbi share a single `¥` symbol.
- `public/favicon.svg`: dollar sign inside a circle, shared by the browser favicon and the navbar image. Both point to `/favicon.svg`, so updating this single file updates both uses.
- `src/projectLinks.ts`: shared GitHub repository and OpenAPI specification URLs used by the documentation and footer.
- `src/router.ts`: Vue Router history routes, the `/index.html` redirect, not-found handling, and navigation scroll behavior.
- `src/views/QuizView.vue`: quiz screens and interaction with the session composable.
- `src/views/ApiDocsView.vue`: API reference, code examples, contract links, and public request explorer.
- `swagger/index.html` and `src/swagger/main.ts`: standalone Swagger page, shared contract asset, explicit API requests, and theme integration, outside Vue Router.
- `src/swagger/requests.ts`: Swagger request interceptor for same-origin credentials, browser-owned headers, cancellation, and timeouts.
- `src/swagger/swagger.css`: page layout and appearance layered over Swagger's own component CSS.
- `src/views/AdminLoginView.vue` and `src/views/AdminView.vue`: admin sign-in, searchable question bank, and create/edit/delete workflows.
- `src/components/QuestionEditor.vue` and `src/admin/questionForm.ts`: accessible editor dialog, validation, and typed create/PATCH payloads.
- `src/admin/admin.css`: shared admin-page styling layered over Bulma.
- `src/composables/adminSession.ts`: HttpOnly cookie session metadata, restoration, renewal, expiry, cross-tab locking, and server-side sign-out.
- `src/composables/questionBankRevision.ts`: invalidate cached public question data after successful administration changes.
- `src/views/NotFoundView.vue`: unmatched-route page with navigation back to the application.
- `src/docs/apiReference.ts`: endpoint metadata and typed request/response examples, plus JavaScript and shell example builders.
- `src/composables/useQuiz.ts`: session state, shuffling, submission, scoring, and retry handling.
- `src/composables/quizStorage.ts`: versioned browser storage and saved-session validation.
- `src/api/client.ts`: native `fetch` requests using generated model types, response validation, timeouts, and API errors.
- `src/api/adminClient.ts`: authenticated administration requests, safe API errors, and runtime validation of login and question responses.
- `src/style.css`: application styling layered over Bulma's CSS.
- `public/netlify.toml`: Netlify build settings, same-origin API proxy, Vue and Swagger page routes, and headers; discovered through Netlify's `public` package-directory setting.
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
