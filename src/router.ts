import { createRouter, createWebHistory } from 'vue-router'
import QuizView from './views/QuizView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/index.html', redirect: '/' },
    { path: '/', name: 'quiz', component: QuizView },
    {
      path: '/documentation/:section?',
      name: 'documentation',
      component: () => import('./views/ApiDocsView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('./views/NotFoundView.vue'),
    },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { left: 0, top: 0 }
  },
})
