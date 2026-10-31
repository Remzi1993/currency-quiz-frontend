# Core Web Technologies

I use HTML, CSS and modern JavaScript through Vue and TypeScript to build the quiz frontend.

| Topic | What I implemented | Code evidence |
|-------|--------------------|---------------|
| Semantic HTML | A main content area, labelled sections, navigation and native form controls. | [QuizView.vue](../../../src/views/QuizView.vue), [AppNavbar.vue](../../../src/components/AppNavbar.vue) |
| Responsive CSS | Reusable CSS variables, spacing, Flexbox and Grid. Media queries adapt the layout to smaller screens. | [style.css](../../../src/style.css) |
| Modern JavaScript and DOM | `const`/`let`, arrow functions, destructuring and template literals. Vue updates the page from reactive state; DOM calls manage focus and the page title. | [useQuiz.ts](../../../src/composables/useQuiz.ts), [App.vue](../../../src/App.vue) |
| Fetch and JSON | Async GET/POST requests, JSON parsing/serialization and response validation. HTTP errors, network failures and timeouts produce usable messages. | [client.ts](../../../src/api/client.ts) |
| Browser storage | `localStorage` saves the round and question-count preference across reloads. Invalid stored data is discarded; blocked storage does not stop the quiz. | [quizStorage.ts](../../../src/composables/quizStorage.ts) |
| Basic accessibility | A skip link, focus management, labelled radio buttons, status messages and error alerts. CSS includes visible focus and reduced-motion support. | [App.vue](../../../src/App.vue), [QuizView.vue](../../../src/views/QuizView.vue), [style.css](../../../src/style.css) |

I chose `localStorage` to keep progress between browser sessions. `sessionStorage` would suit tab-only state; cookies would suit data the server needs with requests.

The existing [API tests](../../../src/api/client.test.ts) and [storage tests](../../../src/composables/quizStorage.test.ts) run with `npm test` from the project root (PowerShell 7+ and Bash). Keyboard and screen-reader testing still needs verification; I do not claim full WCAG compliance.
