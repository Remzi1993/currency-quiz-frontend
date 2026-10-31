# Component Architecture & Framework Basics

I use Vue single-file components with TypeScript. Shared layout, reusable UI pieces and page views have separate responsibilities.

| Topic | What I implemented | Code evidence |
|-------|--------------------|---------------|
| Component structure | `App.vue` combines navigation, the current view and the footer. Views reuse components such as `AppIcon`, keeping common UI in one place. | [App.vue](../../../src/App.vue), [QuizView.vue](../../../src/views/QuizView.vue) |
| Props | Props are inputs from a parent. `AppIcon` receives a typed `name` prop to choose an icon; it does not change that input. | [AppIcon.vue](../../../src/components/AppIcon.vue) |
| State and reactivity | State holds values that change. The navbar owns `menuOpen`; `useQuiz` holds round state and uses `computed` for scores and progress. Vue updates the UI when that state changes. | [AppNavbar.vue](../../../src/components/AppNavbar.vue), [useQuiz.ts](../../../src/composables/useQuiz.ts) |
| Component events | The navbar emits `showHelp`; `App.vue` handles it and opens its own dialog. Children communicate actions upward without directly changing parent state. | [AppNavbar.vue](../../../src/components/AppNavbar.vue), [App.vue](../../../src/App.vue) |
| Client-side routing | Vue Router connects quiz, documentation and not-found views. `RouterLink` changes routes and `RouterView` displays the matching view. `KeepAlive` preserves the quiz when switching views. | [router.ts](../../../src/router.ts), [AppNavbar.vue](../../../src/components/AppNavbar.vue), [App.vue](../../../src/App.vue) |

Official references for these patterns: [Vue components](https://vuejs.org/guide/essentials/component-basics.html), [reactivity](https://vuejs.org/guide/essentials/reactivity-fundamentals.html) and [Vue Router](https://router.vuejs.org/guide/). I still need to record one concrete documentation lookup and explain how I applied it.
