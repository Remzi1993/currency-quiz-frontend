# Currency Quiz

A public quiz frontend for `currency-quiz-backend`, built with Vue 3, TypeScript 6, Vite 8, and Bulma 1. Bulma's precompiled CSS provides the layout, controls, and components; no Sass compiler or CSS framework JavaScript is needed. `openapi-fetch` uses the generated types from the API contract in `shared/`.

Choose 10, 20, or all available questions and play a shuffled round. Each answer is checked once by the backend. The frontend shows feedback, progress, a final score, and a review of your submitted answers. The public API returns correctness only, so an incorrect answer does not reveal the correct option. Quiz state stays in memory and resets when the page reloads. No account or admin interface is included.

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

`typecheck` checks the Vue application, configuration, and tests. `test` uses Node's built-in test runner and native TypeScript support to verify the API client and quiz state without a running backend. These tests do not establish compatibility with a running backend. `build` type-checks and creates the static application in `dist/`; `preview` serves that build locally.

## Code structure

- `src/App.vue` and `src/components/`: quiz screens and reusable visual components.
- `src/composables/useQuiz.ts`: session state, shuffling, submission, scoring, and retry handling.
- `src/api/client.ts`: typed HTTP requests, response validation, timeouts, and API errors.
- `src/style.css`: application styling layered over Bulma's CSS.
- `shared/openapi/currency-quiz.v1.yaml`: API contract; `shared/generated/typescript/schema.d.ts` supplies the client types. Update the shared contract through its own repository rather than editing generated types.

TypeScript uses `target: "ESNext"` and `lib: ["ESNext", "DOM", "DOM.Iterable"]` for the browser application. DOM libraries supply browser APIs such as `document` and `fetch`; they are needed alongside the latest JavaScript definitions. Vite also targets `esnext`, and the module-preload polyfill is disabled. The application assumes current browsers and adds no legacy-browser compatibility layer.
