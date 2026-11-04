import { appendFileSync, existsSync, readFileSync } from 'node:fs'

// Used locally and by each CI job; missing reports must not obscure an earlier failed step.
const kind = process.argv[2] ?? 'all'
if (!['all', 'vitest', 'e2e', 'mutation'].includes(kind)) {
  throw new Error('Expected all, vitest, e2e or mutation.')
}
const lines = ['### Frontend test results', '']
let reports = 0

function readReport(path) {
  if (!existsSync(path)) return null
  reports++
  return JSON.parse(readFileSync(path, 'utf8'))
}

if (kind === 'all' || kind === 'vitest') {
  const tests = readReport('reports/vitest/results.json')
  if (tests) {
    lines.push(`- Vitest: ${tests.success ? 'passed' : 'FAILED'}; ${tests.numPassedTests} passed, ${tests.numFailedTests} failed, ${tests.numPendingTests} pending (${tests.numTotalTests} total); ${tests.numFailedTestSuites ?? 0} failed suites.`)
  }
  const coverage = readReport('coverage/coverage-summary.json')?.total
  if (coverage) {
    lines.push(`- Scoped coverage: lines ${coverage.lines.pct}%, statements ${coverage.statements.pct}%, branches ${coverage.branches.pct}%, functions ${coverage.functions.pct}%.`)
  }
}

if (kind === 'all' || kind === 'e2e') {
  const report = readReport('reports/playwright/results.json')
  if (report) {
    const browser = report.stats
    const errors = report.errors?.length ?? 0
    lines.push(`- Playwright: ${browser?.expected ?? 0} passed, ${browser?.unexpected ?? 0} failed, ${browser?.flaky ?? 0} flaky, ${browser?.skipped ?? 0} skipped; ${errors} runner errors (${((browser?.duration ?? 0) / 1000).toFixed(1)}s).`)
  }
}

if (kind === 'all' || kind === 'mutation') {
  const mutation = readReport('reports/mutation/mutation.json')
  if (mutation) {
    const counts = {}
    for (const file of Object.values(mutation.files)) {
      for (const mutant of file.mutants) counts[mutant.status] = (counts[mutant.status] ?? 0) + 1
    }
    const killed = counts.Killed ?? 0
    const timedOut = counts.Timeout ?? 0
    const survived = counts.Survived ?? 0
    const uncovered = counts.NoCoverage ?? 0
    const total = killed + timedOut + survived + uncovered
    const score = total ? `${(100 * (killed + timedOut) / total).toFixed(2)}%` : 'n/a'
    lines.push(`- Question-form mutation score: ${score}; ${killed} killed, ${timedOut} timed out, ${survived} survived, ${uncovered} uncovered. Compile/runtime errors and ignored mutants are excluded.`)
  }
}

if (!reports) lines.push('No test report was produced. Inspect the preceding CI steps for installation, type-checking or runner failures.')
lines.push('', 'Coverage applies to the modules listed in vitest.config.ts. Browser tests use a local HTTP fake; the running backend is not verified.', '')
const markdown = lines.join('\n')
console.log(markdown)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown)
