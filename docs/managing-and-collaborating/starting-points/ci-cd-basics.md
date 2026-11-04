# CI/CD Basics

[Frontend CI](../../../.github/workflows/ci.yml) checks pushes, pull requests and manual runs with three independent jobs. Each job checks out the pinned shared contract, installs locked dependencies with Node.js 26 and runs on Ubuntu. Repository permissions allow reads only; a newer run cancels an older run for the same workflow and ref.

| Job | Checks and acceptance | Reports |
|-----|-----------------------|---------|
| `checks` | Type checking → Vitest with coverage → production build. Type or test failures and coverage below the configured thresholds prevent the build step. | Vitest JUnit, coverage HTML, LCOV and JSON summary. |
| `e2e` | Installs Chromium and runs Playwright against its own local frontend and fake API. Any failing case fails the job; retries are disabled. | Playwright HTML and JUnit, with traces and screenshots for failures. |
| `mutation` | Runs Stryker against question-form validation. A score below 75% fails the job; 85% is the improvement target. | Mutation HTML and JSON. |

Coverage gates require 90% lines/statements, 85% functions and 80% branches in the [selected source scope](../../../vitest.config.ts). They are not whole-application percentages. The [mutation configuration](../../../stryker.config.json) covers one module. These separate gates encourage checking relevant branches and assertions without treating a single high percentage as proof of correctness. TypeScript provides static checks; there is no separate lint stage.

Jobs run in parallel for earlier feedback. Playwright also uses two workers, fresh browser contexts and per-test API tenants so concurrent cases do not share records or session state. Vitest isolates files, restores mocks and uses fake clocks for timing boundaries. Role and label selectors, retrying browser assertions and explicit HTTP controls reduce timing dependence. Repeated failures should be diagnosed using the captured evidence; zero retries make a first failure visible rather than silently accepting a later pass.

Each job adds a step summary and uploads available reports even after a failing test step, retaining artifacts for 14 days. Open **Actions → Frontend CI → the failing job**, inspect the first relevant diagnostic, then download its report. Type errors belong to `checks`; browser traces show interaction and request failures; the mutation report identifies survivors for targeted review. Fix the cause and rerun the relevant local command before pushing.

The [README](../../../README.md#continuous-integration) documents local commands for PowerShell 7+ and Linux/Bash. The [test strategy](../../testing-strategy.md) explains the environment, gates and evidence limits. The workflow builds the application without deploying it or changing Netlify settings. Branch rules must separately require the three job statuses if they should block merges; a workflow file alone does not enforce branch protection.

A hosted Actions run remains to be recorded after the changes are pushed. Step summaries and retained reports provide per-run visibility, but longitudinal coverage, mutation and failure trends need multiple saved runs. No historical flakiness baseline or demonstrated failed-run/fix/passing-run sequence is claimed. Browser tests use a fake provider; live-backend acceptance and provider verification of consumer expectations remain separate follow-up work.
