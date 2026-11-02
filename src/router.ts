import { createRouter, createWebHistory } from 'vue-router'
import QuizView from './views/QuizView.vue'
import { adminSession } from './composables/adminSession.ts'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/index.html', redirect: '/' },
    { path: '/', name: 'quiz', component: QuizView },
    {
      path: '/admin/login',
      name: 'admin-login',
      component: () => import('./views/AdminLoginView.vue'),
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('./views/AdminView.vue'),
      meta: { requiresAdmin: true },
    },
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

router.beforeEach((to) => {
  const token = adminSession.getToken()
  if (to.meta.requiresAdmin && !token) return { name: 'admin-login' }
  if (to.name === 'admin-login' && token) return { name: 'admin' }
})
