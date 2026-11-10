import type { AdminQuestion } from '../../shared/generated/typescript/schema'

export const seedQuestions: AdminQuestion[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    text: 'Which currency is used in Japan?',
    options: ['Japanese yen', 'Euro'],
    correctAnswer: 'Japanese yen',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    text: 'Which currency is used in the Netherlands?',
    options: ['Euro', 'British pound'],
    correctAnswer: 'Euro',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    text: 'Which currency is used in the United Kingdom?',
    options: ['British pound', 'Japanese yen'],
    correctAnswer: 'British pound',
  },
]

// These credentials exist only in the disposable fake API, never in the real backend.
export const testCredentials = { username: 'e2e-admin', password: 'e2e-only-password' }

export interface ApiState {
  refreshes: number
  listReads: number
  answers: Array<{ questionId: string; answer: string }>
  mutations: Array<{ method: string; body: unknown }>
  questionCount: number
}

export interface ApiScenario {
  expireAccess?: boolean
  expireRefresh?: boolean
  failNextList?: boolean
  rateLimitNextAnswer?: boolean
  holdAnswers?: boolean
}
