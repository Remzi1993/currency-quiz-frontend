import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    allowOnly: !process.env.CI,
    restoreMocks: true,
    clearMocks: true,
    reporters: ['default', 'junit', 'json'],
    outputFile: { junit: 'reports/vitest/junit.xml', json: 'reports/vitest/results.json' },
    coverage: {
      provider: 'v8',
      include: [
        'src/api/**/*.ts',
        'src/admin/**/*.ts',
        'src/composables/**/*.ts',
        'src/docs/**/*.ts',
        'src/swagger/requests.ts',
        'src/components/QuestionEditor.vue',
      ],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: { lines: 90, statements: 90, functions: 85, branches: 80 },
    },
  },
})
