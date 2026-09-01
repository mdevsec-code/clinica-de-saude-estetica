<script setup lang="ts">
import { computed, nextTick, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { instagramLink, whatsappLink } from '@/services/settings.service';
import { applyStaggerReveal } from '@/composables/useStaggerReveal';
import { applySpotlightHover } from '@/composables/useSpotlightHover';
import { refreshScroll } from '@/composables/useSmoothScroll';
import WhatsAppButton from '@/components/WhatsAppButton.vue';
import LoadingState from '@/components/LoadingState.vue';
import PageHeroBand from '@/components/PageHeroBand.vue';

const settings = useSettingsStore();
settings.load();

// O grid de cards só existe no DOM depois que settings.loading vira false —
// aplicar o reveal em stagger direto no onMounted não encontraria nada.
// immediate:true cobre o caso comum de settings já estarem em cache (outro
// componente, como o header/footer, já chamou load() antes): sem isso, se
// loading já começasse "false" no momento do setup, a transição true→false
// que o watch normalmente espera nunca aconteceria, e o reveal nunca rodaria.
watch(
  () => settings.loading,
  async (loading) => {
    if (loading) return;
    await nextTick();
    applyStaggerReveal('.contact-grid', '.contact-card');
    applySpotlightHover('.contact-grid', '.contact-card');
    refreshScroll();
  },
  { immediate: true },
);

const weekdayLabels = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const hours = computed(() =>
  (settings.data?.businessHours ?? []).map((bh) => ({
    label: weekdayLabels[bh.weekday],
    range: `${bh.opensAt} – ${bh.closesAt}`,
  })),
);

const igHref = computed(() => (settings.data?.instagram ? instagramLink(settings.data.instagram) : null));

// Aponta direto para a ficha real da clínica no Google Maps (Clínica Noely
// Cerqueira Saúde e Beleza), não para uma busca genérica pelo texto do
// endereço — o link completo com CID foi enviado pela própria cliente.
// `cid` é o identificador único do local no Google (extraído do link de
// compartilhamento: 0x28a91f6ac1e3b6cd em hex = 2929907575961138893 em
// decimal); output=embed devolve um iframe funcional sem precisar de chave
// de API/billing, e cai exatamente no pino certo — não numa aproximação por
// texto de endereço, que podia acertar a rua errada num bairro comum.
const GOOGLE_MAPS_PLACE_URL =
  'https://www.google.com/maps/place/Cl%C3%ADnica+Noely+Cerqueira+Sa%C3%BAde+e+Beleza/@-12.6874089,-38.335303,17z/data=!3m1!4b1!4m6!3m5!1s0x71669396953b1ad:0x28a91f6ac1e3b6cd!8m2!3d-12.6874089!4d-38.3327281!16s%2Fg%2F11g_ymkc29';
const GOOGLE_MAPS_CID = '2929907575961138893';

const mapEmbedSrc = computed(() => `https://www.google.com/maps?cid=${GOOGLE_MAPS_CID}&output=embed`);
const mapLinkHref = computed(() => GOOGLE_MAPS_PLACE_URL);
</script>

<template>
  <div class="contact-page">
    <PageHeroBand
      eyebrow="Fale com a gente"
      title="Fale conosco"
      description="Estamos à disposição para tirar dúvidas ou ajudar no seu agendamento."
    />

    <div class="container contact-page__body">
      <LoadingState v-if="settings.loading" />
      <div v-else class="contact-grid">
        <div class="contact-card contact-card--whatsapp">
          <span class="contact-card__icon contact-card__icon--whatsapp">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.39a9.9 9.9 0 0 0 4.76 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2Zm0 18.02a8.17 8.17 0 0 1-4.16-1.14l-.3-.18-3.13.82.84-3.05-.19-.31a8.13 8.13 0 0 1-1.25-4.35c0-4.5 3.66-8.16 8.19-8.16 4.52 0 8.19 3.66 8.19 8.16 0 4.51-3.67 8.21-8.19 8.21Zm4.48-6.13c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.78.95-.14.16-.28.18-.53.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.35-1.67-.14-.24-.02-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.42-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.11 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" />
            </svg>
          </span>
          <h2>Fale pelo WhatsApp</h2>
          <p class="contact-card__hint">Resposta rápida, direto com a equipe da clínica.</p>
          <WhatsAppButton
            v-if="settings.data?.whatsapp"
            variant="inline"
            label="Enviar mensagem"
          />
        </div>

        <div class="contact-card" v-if="igHref">
          <span class="contact-card__icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <h2>Instagram</h2>
          <a :href="igHref" target="_blank" rel="noopener">{{ settings.data?.instagram }}</a>
        </div>

        <div class="contact-card" v-if="hours.length">
          <span class="contact-card__icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
            </svg>
          </span>
          <h2>Horário de funcionamento</h2>
          <p v-for="h in hours" :key="h.label"><span class="contact-card__day">{{ h.label }}</span> {{ h.range }}</p>
        </div>
      </div>

      <div v-if="mapEmbedSrc" class="contact-map">
        <div class="contact-map__caption">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.2" /></svg>
          <span>{{ settings.data?.address }}</span>
        </div>
        <iframe
          :src="mapEmbedSrc"
          title="Localização da clínica no Google Maps"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          allowfullscreen
        />
        <a :href="mapLinkHref!" target="_blank" rel="noopener" class="contact-map__cta">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.2" /></svg>
          Abrir no Google Maps
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.contact-page__body {
  padding-block: var(--space-6) var(--space-8);
}

.contact-grid {
  display: grid;
  gap: var(--space-4);
}

.contact-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--color-rose-100);
  color: var(--color-rose-700);
  margin-bottom: var(--space-4);
}

.contact-card__icon--whatsapp {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.contact-card__hint {
  color: var(--color-ink-muted);
  margin-bottom: var(--space-4);
  max-width: 40ch;
}

.contact-card__day {
  display: inline-block;
  min-width: 74px;
  font-weight: 600;
  color: var(--color-ink);
}

.contact-card {
  --spot-x: 50%;
  --spot-y: 0%;
  position: relative;
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  transition: border-color var(--duration-base) var(--ease-premium), box-shadow var(--duration-base) var(--ease-premium), transform var(--duration-base) var(--ease-premium);
}

.contact-card::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0;
  background: radial-gradient(220px circle at var(--spot-x) var(--spot-y), var(--color-rose-100), transparent 70%);
  transition: opacity var(--duration-base) var(--ease-premium);
  pointer-events: none;
}

.contact-card.is-spotlit::before {
  opacity: 1;
}

.contact-card:hover {
  border-color: var(--color-rose-500);
  box-shadow: var(--shadow-md);
  transform: translateY(-3px);
}

.contact-card > * {
  position: relative;
  z-index: 1;
}

.contact-card h2 {
  font-size: 1.1rem;
  margin-bottom: var(--space-3);
}

.contact-card a {
  color: var(--color-rose-700);
  font-weight: 600;
}

.contact-card--whatsapp {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
  border-color: transparent;
  color: #fff;
}

.contact-card--whatsapp::before {
  background: radial-gradient(220px circle at var(--spot-x) var(--spot-y), rgba(255, 255, 255, 0.14), transparent 70%);
}

.contact-card--whatsapp h2 {
  color: #fff;
}

.contact-card--whatsapp .contact-card__hint {
  color: rgba(255, 255, 255, 0.8);
}

.contact-card--whatsapp:hover {
  border-color: transparent;
  box-shadow: var(--shadow-glow);
}

.contact-map {
  position: relative;
  margin-top: var(--space-5);
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}

.contact-map__caption {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: var(--space-4) var(--space-5);
  background: var(--color-surface);
  color: var(--color-ink);
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}

.contact-map__caption svg {
  flex-shrink: 0;
  color: var(--color-rose-700);
}

.contact-map iframe {
  display: block;
  width: 100%;
  height: 360px;
  border: none;
  filter: saturate(0.9);
}

.contact-map__cta {
  position: absolute;
  right: var(--space-4);
  bottom: var(--space-4);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--color-surface);
  color: var(--color-rose-900);
  font-weight: 700;
  font-size: 0.85rem;
  padding: 10px 18px;
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-md);
  transition: transform var(--duration-base) var(--ease-premium), box-shadow var(--duration-base) var(--ease-premium);
}

.contact-map__cta:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

@media (min-width: 780px) {
  .contact-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .contact-map iframe {
    height: 420px;
  }
}
</style>
