import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/servicos',
      name: 'services',
      component: () => import('@/views/ServicesView.vue'),
    },
    {
      path: '/agendar',
      name: 'booking',
      component: () => import('@/views/BookingView.vue'),
    },
    {
      path: '/contato',
      name: 'contact',
      component: () => import('@/views/ContactView.vue'),
    },
    {
      path: '/admin/login',
      name: 'admin-login',
      component: () => import('@/views/admin/AdminLoginView.vue'),
    },
    {
      path: '/admin',
      component: () => import('@/views/admin/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'admin-dashboard',
          component: () => import('@/views/admin/AdminDashboardView.vue'),
        },
        {
          path: 'servicos',
          name: 'admin-catalog',
          component: () => import('@/views/admin/AdminCatalogView.vue'),
        },
        {
          path: 'agenda',
          name: 'admin-agenda',
          component: () => import('@/views/admin/AdminAgendaView.vue'),
        },
        {
          path: 'financeiro',
          name: 'admin-finance',
          component: () => import('@/views/admin/AdminFinanceView.vue'),
        },
        {
          path: 'estoque',
          name: 'admin-inventory',
          component: () => import('@/views/admin/AdminInventoryView.vue'),
        },
        {
          path: 'usuarios',
          name: 'admin-users',
          meta: { requiresRole: 'ADMIN' },
          component: () => import('@/views/admin/AdminUsersView.vue'),
        },
        {
          path: 'auditoria',
          name: 'admin-audit',
          meta: { requiresRole: 'ADMIN' },
          component: () => import('@/views/admin/AdminAuditView.vue'),
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
    },
  ],
});

// Painel administrativo: nenhuma rota sob meta.requiresAuth renderiza sem um
// token salvo. Para rotas com meta.requiresRole (ex.: Usuários, só ADMIN),
// precisamos confirmar o papel de verdade — e auth.user só existe depois de
// restoreSession() rodar, então o guard aguarda isso aqui em vez de confiar
// no onMounted do AdminLayout (que rodaria tarde demais, depois da view já
// ter tentado renderizar). Um token inválido/expirado faz restoreSession
// deslogar sozinho — o guard então redireciona para o login normalmente.
router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true;

  const auth = useAuthStore();
  if (!auth.isAuthenticated) {
    return { name: 'admin-login', query: { redirect: to.fullPath } };
  }

  if (!auth.user) {
    await auth.restoreSession();
  }
  if (!auth.isAuthenticated) {
    return { name: 'admin-login', query: { redirect: to.fullPath } };
  }

  if (to.meta.requiresRole && auth.user?.role !== to.meta.requiresRole) {
    return { name: 'admin-dashboard' };
  }

  return true;
});
