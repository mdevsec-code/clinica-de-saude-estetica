import { defineStore } from 'pinia';
import type { AdminUser } from '@/types';
import { fetchMe, login as loginRequest } from '@/services/auth.service';
import { ApiError } from '@/services/api';

const TOKEN_KEY = 'noely_admin_token';

interface AuthState {
  token: string | null;
  user: AdminUser | null;
  loading: boolean;
  error: string | null;
}

// Token em localStorage (não cookie): API e front rodam em origens diferentes
// hoje (item já refletido em services/api.ts, que já lia essa mesma chave
// antes de existir qualquer tela de login). Nunca guardamos a senha, só o
// JWT — que já carrega tenantId/role e expira sozinho (ver auth.service.ts
// no backend).
export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: localStorage.getItem(TOKEN_KEY),
    user: null,
    loading: false,
    error: null,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
  },
  actions: {
    async login(email: string, password: string) {
      this.loading = true;
      this.error = null;
      try {
        const result = await loginRequest(email, password);
        this.token = result.token;
        this.user = result.user;
        localStorage.setItem(TOKEN_KEY, result.token);
        return true;
      } catch (err) {
        this.error = err instanceof ApiError ? err.message : 'Não foi possível entrar. Tente novamente.';
        return false;
      } finally {
        this.loading = false;
      }
    },

    logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem(TOKEN_KEY);
    },

    // Chamado pelo guard de rota do painel: confirma que o token salvo ainda
    // é válido e preenche `user` (perdido em qualquer recarregamento de
    // página, já que só o token persiste). Um token inválido/expirado aqui
    // já limpa a sessão sozinho.
    async restoreSession() {
      if (!this.token || this.user) return;
      try {
        const { user } = await fetchMe();
        this.user = user;
      } catch {
        this.logout();
      }
    },
  },
});
