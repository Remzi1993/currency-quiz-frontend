# Input Validation & Secure Coding
- **Knowledge article url:** https://boksa.hbo-ict-hva.nl/profiles/full-stack-developer/design-and-realise/input-validation-and-secure-coding/
- **Author:** Remzi Çavdar
- **AI disclosure:** I used OpenAI Codex to assist in drafting this document by analysing my codebase, identifying
  relevant implementations, and comparing my work against the AUAS BoKSA knowledge article. Codex helped structure and
  formulate the documentation based on these findings. I independently reviewed, verified, and edited the generated
  content to ensure it accurately reflects my work and understanding. I take full responsibility for the accuracy,
  completeness, and quality of this document.

I treat API responses and saved browser state as external input. These browser checks complement server-side validation in the backend.

Admin access and refresh JWTs are HttpOnly cookies managed by the browser. I keep only username, current refresh/access deadlines, and CSRF in memory, clean up the legacy stored JWT, and send CSRF with cookie-authenticated changes. Refresh/login/logout use a shared browser lock; idle tabs do not poll to stay signed in. Defaults are five-minute access, ten-minute refresh from each issuance, and 24 hours from original sign-in overall. All three lifetimes are configurable in the backend. Refresh replaces both cookies while preserving CSRF and the signed original absolute deadline. If refresh expires before renewal, login is required again even before that deadline. The backend stores no authentication sessions, so logout and replacement cannot revoke earlier JWTs or detect reuse. See the backend's [secure coding practices](https://github.com/Remzi1993/currency-quiz-backend/blob/main/docs/designing-and-realising/deepening/secure-coding-practices.md) for the design, tests and remaining risks. HttpOnly reduces credential exposure but does not make unsafe HTML safe.

| Topic                    | What I implemented or reviewed                                                                                                                                                                                                               | Code evidence                                                                                          |
|--------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| Runtime validation       | The client checks allowed fields, types, UUIDs, lengths and unique options before accepting API data. Saved quiz state is also validated; invalid data is discarded. Generated TypeScript types alone cannot perform these checks.           | [client.ts](../../../src/api/client.ts), [quizStorage.ts](../../../src/composables/quizStorage.ts)     |
| Safe HTML rendering      | Questions, options and recorded answers use [Vue text interpolation](https://vuejs.org/guide/best-practices/security.html#html-content). The API explorer also displays response bodies as text inside `<code>`, including HTML error pages. | [QuizView.vue](../../../src/views/QuizView.vue), [ApiDocsView.vue](../../../src/views/ApiDocsView.vue) |
| JavaScript string output | Generated JavaScript examples quote URL and method values with `JSON.stringify`. The examples are displayed as text, not inserted into inline scripts; this is not a general HTML sanitizer.                                                 | [apiReference.ts](../../../src/docs/apiReference.ts)                                                   |
| Small review example     | Hypothetical unsafe code: `<legend v-html="currentQuestion.text"></legend>`. Replacement: `<legend>{{ currentQuestion.text }}</legend>`, matching the existing view. This keeps question content as text instead of parsing it as HTML.      | [QuizView.vue](../../../src/views/QuizView.vue)                                                        |

The review example illustrates a risk, not a bug found in the project. The interface displays plain text, so no rich-HTML sanitizer is implemented. [OWASP distinguishes safe text output from HTML sanitisation](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html). There is no SQL access in this frontend.

Existing [client tests](../../../src/api/client.test.ts) check malformed responses and unexpected fields. 
Run `npm test` from the frontend root (PowerShell 7+ and Bash). Browser tests for stored or reflected XSS still need to be added; 
safe rendering patterns alone do not demonstrate complete XSS protection.
