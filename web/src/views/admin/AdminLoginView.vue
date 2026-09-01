<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { gsap, prefersReducedMotion } from '@/lib/motion';
import DecorativeDots from '@/components/DecorativeDots.vue';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const card = ref<HTMLElement | null>(null);

onMounted(() => {
  if (prefersReducedMotion() || !card.value) return;
  gsap.fromTo(
    card.value,
    { opacity: 0, y: 28, scale: 0.97 },
    { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'premium-out' },
  );
});

async function onSubmit() {
  const ok = await auth.login(email.value.trim(), password.value);
  if (ok) {
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/admin';
    router.push(redirect);
  }
}
</script>

<template>
  <div class="admin-login">
    <DecorativeDots :count="12" />
    <div class="admin-login__glow" aria-hidden="true" />

    <form ref="card" class="admin-login__card" @submit.prevent="onSubmit">
      <div class="admin-login__logo-ring">
        <img class="admin-login__logo" src="/brand/logo-noely-cerqueira.png" alt="Noely Cerqueira" />
      </div>
      <h1>Área administrativa</h1>
      <p class="admin-login__hint">Acesso restrito à equipe da clínica.</p>

      <label>
        E-mail
        <input v-model="email" type="email" autocomplete="username" required placeholder="seu@email.com" />
      </label>
      <label>
        Senha
        <input v-model="password" type="password" autocomplete="current-password" required placeholder="••••••••" />
      </label>

      <p v-if="auth.error" class="admin-login__error">{{ auth.error }}</p>

      <button type="submit" class="button button--primary" :disabled="auth.loading">
        {{ auth.loading ? 'Entrando…' : 'Entrar' }}
      </button>

      <RouterLink to="/" class="admin-login__back">← Voltar ao site</RouterLink>
    </form>
  </div>
</template>

<style scoped>
.admin-login {
  position: relative;
  overflow: hidden;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background-color: var(--color-dusk-900);
  background-image: radial-gradient(circle at 18% 14%, var(--color-rose-900) 0%, transparent 55%),
    radial-gradient(circle at 84% 82%, var(--color-dusk-700) 0%, transparent 60%);
}

.admin-login__glow {
  position: absolute;
  inset: -20% -10% auto -10%;
  height: 55%;
  background: radial-gradient(ellipse at top, rgba(220, 171, 168, 0.22), transparent 70%);
  pointer-events: none;
}

.admin-login__card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 400px;
  background: var(--color-surface);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-glow);
  padding: var(--space-7) var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.admin-login__logo-ring {
  width: 88px;
  height: 88px;
  margin-inline: auto;
  margin-bottom: var(--space-2);
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-rose-100), var(--color-surface));
  border: 1px solid var(--color-rose-300);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
}

.admin-login__logo {
  height: 52px;
  width: auto;
}

.admin-login__card h1 {
  font-size: 1.6rem;
  text-align: center;
}

.admin-login__hint {
  color: var(--color-ink-muted);
  text-align: center;
  font-size: 0.9rem;
  margin-top: calc(var(--space-3) * -1);
}

.admin-login__card label {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--color-ink);
}

.admin-login__card input {
  font-family: inherit;
  font-size: 1rem;
  font-weight: 400;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.admin-login__card input:focus-visible {
  border-color: var(--color-rose-500);
  box-shadow: 0 0 0 3px var(--color-rose-100);
}

.admin-login__error {
  color: var(--color-danger);
  font-size: 0.85rem;
  font-weight: 500;
}

.admin-login__card .button {
  margin-top: var(--space-2);
}

.admin-login__back {
  text-align: center;
  font-size: 0.85rem;
  color: var(--color-ink-soft);
  font-weight: 600;
  transition: color var(--duration-fast) var(--ease-standard);
}

.admin-login__back:hover {
  color: var(--color-rose-700);
}
</style>
