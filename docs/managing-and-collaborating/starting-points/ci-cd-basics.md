# CI/CD Basics

I use GitHub Actions to check the frontend on pushes and pull requests. The workflow can also be started manually from the Actions page.

| Topic                      | Current implementation                                                                                                                    | Evidence                                                                                                                                                                       |
|----------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Workflow setup             | One `checks` job runs on Ubuntu with Node.js 26. Checkout initializes the pinned shared submodule; `npm ci` installs locked dependencies. | [ci.yml](../../../.github/workflows/ci.yml), [package-lock.json](../../../package-lock.json)                                                                                   |
| Static checks              | Type checking runs first to catch incompatible application, configuration and test types. This is not a separate lint stage.              | [package.json](../../../package.json), [tsconfig.test.json](../../../tsconfig.test.json)                                                                                       |
| Tests                      | The test step checks API handling, quiz behaviour, persistence and documentation against the contract before building.                    | [client.test.ts](../../../src/api/client.test.ts), [useQuiz.test.ts](../../../src/composables/useQuiz.test.ts), [apiReference.test.ts](../../../src/docs/apiReference.test.ts) |
| Build and failure handling | The build produces `dist/` after the earlier checks pass. A failing command stops later steps. The workflow does not deploy to Netlify.   | [ci.yml](../../../.github/workflows/ci.yml), [package.json](../../../package.json)                                                                                             |

In [GitHub workflow YAML](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows), `on` defines triggers, `jobs` defines runner work, and `steps` lists the order. `uses` calls a reusable action; `run` executes a command. Permissions allow repository reads only, and a newer run cancels an older run for the same workflow and ref.

The order is install → type check → test → build: reject invalid types and failing behaviour before producing the application bundle. A separate linter and deployment stage remain missing from the full lint → test → build → deploy sequence.

To investigate a failure, open **Actions → Frontend CI → checks**, expand the failed named step and read its first relevant error. Compiler diagnostics belong to type checking; failed assertions belong to tests. Fix the cause and push the change to rerun the checks. An actual GitHub run and a failed-run/fix/passing-run example still need to be recorded.

The [README](../../../README.md#continuous-integration) lists the same commands for local use (PowerShell 7+ and Bash).
