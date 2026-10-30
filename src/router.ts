import { createRouter, createWebHashHistory } from 'vue-router'
import QuizView from './views/QuizView.vue'

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'quiz', component: QuizView },
    {
      path: '/documentation/:section?',
      name: 'documentation',
      component: () => import('./views/ApiDocsView.vue'),
    },
  ],
})
