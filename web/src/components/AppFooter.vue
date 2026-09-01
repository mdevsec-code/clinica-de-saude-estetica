<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useSettingsStore } from '@/stores/settings';
import { instagramLink, whatsappLink } from '@/services/settings.service';
import { scrollToTopAnimated } from '@/composables/useSmoothScroll';
import DecorativeDots from '@/components/DecorativeDots.vue';

const settings = useSettingsStore();
settings.load();

const weekdayLabels = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const hours = computed(() =>
  (settings.data?.businessHours ?? []).map((bh) => ({
    label: weekdayLabels[bh.weekday],
    range: `${bh.opensAt} – ${bh.closesAt}`,
  })),
);

const waHref = computed(() =>
  settings.data?.whatsapp ? whatsappLink(settings.data.whatsapp, 'Olá! Vim pelo site da Noely Cerqueira.') : null,
);

const igHref = computed(() => (settings.data?.instagram ? instagramLink(settings.data.instagram) : null));
</script>

<template>
  <footer class="footer">
    <DecorativeDots :count="10" tone="light" />
    <div class="container footer__grid">
      <div class="footer__brand">
        <img src="/brand/logo-noely-cerqueira.png" alt="Noely Cerqueira" />
        <p>Estética e micropigmentação em Camaçari (BA).</p>
      </div>

      <nav class="footer__col" aria-label="Navegação do rodapé">
        <h3>Navegação</h3>
        <RouterLink to="/">Início</RouterLink>
        <RouterLink to="/servicos">Serviços</RouterLink>
        <RouterLink to="/agendar">Agendar</RouterLink>
        <RouterLink to="/contato">Contato</RouterLink>
      </nav>

      <div class="footer__col">
        <h3>Contato</h3>
        <a v-if="waHref" :href="waHref" target="_blank" rel="noopener" class="footer__link">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path
              d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.39a9.9 9.9 0 0 0 4.76 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2Zm0 18.02a8.17 8.17 0 0 1-4.16-1.14l-.3-.18-3.13.82.84-3.05-.19-.31a8.13 8.13 0 0 1-1.25-4.35c0-4.5 3.66-8.16 8.19-8.16 4.52 0 8.19 3.66 8.19 8.16 0 4.51-3.67 8.21-8.19 8.21Z"
            />
          </svg>
          <span>{{ settings.data?.whatsapp }}</span>
        </a>
        <a v-if="igHref" :href="igHref" target="_blank" rel="noopener" class="footer__link">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
          </svg>
          <span>{{ settings.data?.instagram }}</span>
        </a>
        <a v-if="settings.data?.email" :href="`mailto:${settings.data.email}`" class="footer__link">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m4 7 8 6 8-6" />
          </svg>
          <span>{{ settings.data.email }}</span>
        </a>
      </div>

      <div class="footer__col">
        <h3>Endereço e horário</h3>
        <p v-if="settings.data?.address" class="footer__link">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11Z" />
            <circle cx="12" cy="10" r="2.2" />
          </svg>
          <span>{{ settings.data.address }}</span>
        </p>
        <p v-for="h in hours" :key="h.label" class="footer__hours-row">{{ h.label }}: {{ h.range }}</p>
      </div>
    </div>

    <div class="container footer__bottom">
      <p class="footer__legal">
        © {{ new Date().getFullYear() }} Noely Cerqueira — Estética e Micropigmentação
      </p>
      <button type="button" class="footer__top" @click="scrollToTopAnimated">
        Voltar ao topo
        <span aria-hidden="true">↑</span>
      </button>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  position: relative;
  overflow: hidden;
  /* Sem margin-top: um espaçamento aqui abriria uma faixa visível da cor de
     fundo padrão (ou do fundo ambiente, fixo atrás de tudo) entre a última
     seção da página e o rodapé — a transição de cor precisa ser direta.
     180deg começando em rose-700 (não rose-900) de propósito: casa
     exatamente com a cor na borda inferior do .cta-final da Home (ver
     HomeView.vue), que termina nessa mesma cor de ponta a ponta — sem isso
     haveria uma costura visível entre as duas seções. Páginas sem
     .cta-final antes do rodapé (Serviços, Contato) não sofrem com isso: a
     diferença de tom ali é sutil o bastante para não chamar atenção. */
  background: linear-gradient(180deg, var(--color-rose-700), var(--color-dusk-900));
  color: var(--color-rose-100);
  padding-block: var(--space-9) var(--space-5);
}

.footer__grid {
  position: relative;
  display: grid;
  gap: var(--space-7);
  grid-template-columns: 1fr;
}

.footer__brand img {
  height: 68px;
  filter: brightness(0) invert(1);
  opacity: 0.92;
  margin-bottom: var(--space-4);
}

.footer__brand p {
  color: var(--color-rose-100);
  opacity: 0.85;
  max-width: 32ch;
}

.footer h3 {
  color: #fff;
  font-family: var(--font-body);
  font-size: 0.85rem;
  line-height: 1.4;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-4);
}

.footer__col {
  display: flex;
  flex-direction: column;
}

.footer__col a,
.footer__col p,
nav.footer__col a {
  color: var(--color-rose-100);
  opacity: 0.85;
  margin-bottom: var(--space-3);
  font-size: 1rem;
}

nav.footer__col a {
  display: block;
  width: fit-content;
  transition: opacity var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard);
}

nav.footer__col a:hover {
  opacity: 1;
  transform: translateX(3px);
}

.footer__link {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  transition: opacity var(--duration-fast) var(--ease-standard);
}

.footer__link svg {
  flex-shrink: 0;
  margin-top: 2px;
  opacity: 0.9;
}

a.footer__link:hover {
  opacity: 1;
}

.footer__hours-row {
  font-size: 0.9rem;
  opacity: 0.75;
  margin-bottom: var(--space-1);
}

.footer__legal {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.footer__bottom {
  position: relative;
  margin-top: var(--space-7);
  padding-top: var(--space-5);
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  font-size: 0.85rem;
  opacity: 0.7;
}

.footer__top {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  padding: 8px 18px;
  border-radius: var(--radius-pill);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  opacity: 1;
  transition: border-color var(--duration-base) var(--ease-premium), transform var(--duration-base) var(--ease-premium), background var(--duration-base) var(--ease-premium);
}

.footer__top:hover {
  border-color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.08);
  transform: translateY(-2px);
}

.footer__top span {
  transition: transform var(--duration-base) var(--ease-premium);
}

.footer__top:hover span {
  transform: translateY(-2px);
}

@media (min-width: 780px) {
  .footer__grid {
    grid-template-columns: 1.3fr 0.8fr 1fr 1.1fr;
  }
}
</style>
