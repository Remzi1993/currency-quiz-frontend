# Language & Runtime

My frontend uses TypeScript during development and JavaScript in the browser. Node.js runs the development tools and tests.

| Topic | Explanation and project example | Code evidence |
|-------|---------------------------------|---------------|
| Logical layers | Views display the interface, `useQuiz` manages round state, and the API client handles HTTP requests. These are code responsibilities within one frontend. | [QuizView.vue](../../../src/views/QuizView.vue), [useQuiz.ts](../../../src/composables/useQuiz.ts), [client.ts](../../../src/api/client.ts) |
| Compilation and execution | `vue-tsc` checks types; Vite compiles and bundles Vue/TypeScript into browser JavaScript. A compiler translates code; an interpreter executes instructions. A [JavaScript engine](https://developer.mozilla.org/en-US/docs/Web/JavaScript) can also JIT-compile code into machine code while running. | [package.json](../../../package.json), [vite.config.ts](../../../vite.config.ts), [main.ts](../../../src/main.ts) |
| Stack and heap | Conceptually, the [call stack](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model#stack_and_execution_contexts) tracks active function calls; the heap contains objects such as question arrays and reactive state. State can outlive the function call that created it. | [useQuiz.ts](../../../src/composables/useQuiz.ts) |
| Memory management | [Garbage collection](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Memory_management) reclaims unreachable objects. Active callbacks can keep state alive: the navbar removes listeners on unmount, and the retry watcher clears its interval during cleanup. | [AppNavbar.vue](../../../src/components/AppNavbar.vue), [QuizView.vue](../../../src/views/QuizView.vue) |
| Shared types versus runtime | The shared package exports declarations only. [Type annotations are erased](https://www.typescriptlang.org/docs/handbook/2/basic-types.html#erased-types), so `import type` does not validate responses. The client separately checks incoming JSON with `isQuestion`. | [shared/package.json](../../../shared/package.json), [client.ts](../../../src/api/client.ts) |

The cleanup code is concrete evidence of managing resources. The memory explanations are conceptual; I have not profiled memory usage or demonstrated that the application is free of memory leaks.
