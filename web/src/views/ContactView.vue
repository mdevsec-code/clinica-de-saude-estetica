<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { instagramLink, whatsappLink } from '@/services/settings.service';
import { applyStaggerReveal } from '@/composables/useStaggerReveal';
import { applySpotlightHover } from '@/composables/useSpotlightHover';
import { applyIconDraw } from '@/composables/useDrawIcon';
import { refreshScroll } from '@/composables/useSmoothScroll';
import { nowInClinicTimezone } from '@/utils/calendar';
import { prefersReducedMotion } from '@/lib/motion';
import WhatsAppButton from '@/components/WhatsAppButton.vue';
import LoadingState from '@/components/LoadingState.vue';
import PageHeroBand from '@/components/PageHeroBand.vue';
import DecorativeDots from '@/components/DecorativeDots.vue';

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
    // Ícones de TRAÇO (Instagram, Horário) eram os únicos ícones de card do
    // site que ainda apareciam "prontos" em vez de se desenharem sozinhos ao
    // entrar na tela — toda outra vitrine de ícone de traço (especialidades,
    // diferenciais, destaque) já usa esse acabamento (ver HomeView.vue). O
    // ícone do WhatsApp fica de fora de propósito: é um glifo 100% preenchido
    // (fill, sem stroke nenhum) — DrawSVG anima stroke-dashoffset, então não
    // tem o que "desenhar" nele; o próprio stagger-reveal do card (fade + y)
    // já é a entrada certa pra esse tipo de ícone.
    applyIconDraw('.contact-grid', '.contact-card__icon--instagram svg', 0.2);
    applyIconDraw('.contact-grid', '.contact-card--hours .contact-card__icon svg', 0.2);
    refreshScroll();
  },
  { immediate: true },
);

const weekdayLabels = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const weekdayLabelsLower = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const weekdayShort = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const hours = computed(() =>
  (settings.data?.businessHours ?? []).map((bh) => ({
    label: weekdayLabels[bh.weekday],
    range: `${bh.opensAt} – ${bh.closesAt}`,
    weekday: bh.weekday,
  })),
);

const igHref = computed(() => (settings.data?.instagram ? instagramLink(settings.data.instagram) : null));

// --- Status "aberto agora" (ao vivo) ---
// A pergunta que a lista estática de horários nunca respondia de cara: "tá
// aberto AGORA?". `nowClock` re-renderiza a cada minuto (não a cada segundo
// — o status só muda na virada de um minuto, então tickar mais rápido só
// gastaria ciclo à toa) pra o indicador virar sozinho de "aberto" pra
// "fechado" (ou vice-versa) se a pessoa deixar a aba aberta atravessando o
// horário de fechamento/abertura, sem precisar recarregar a página.
const nowClock = ref(nowInClinicTimezone());
let clockTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  clockTimer = setInterval(() => {
    nowClock.value = nowInClinicTimezone();
  }, 30_000);
});
onUnmounted(() => clockTimer && clearInterval(clockTimer));

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Dias com pelo menos uma faixa de funcionamento (independente do horário
// atual) — alimenta a tira semanal, que responde "quais dias vocês abrem"
// de relance, sem precisar ler a lista de texto abaixo.
const openWeekdays = computed(() => new Set((settings.data?.businessHours ?? []).map((bh) => bh.weekday)));

const liveStatus = computed(() => {
  const bh = settings.data?.businessHours;
  if (!bh || !bh.length) return null;
  const { weekday, minutes } = nowClock.value;

  const todayRanges = bh
    .filter((h) => h.weekday === weekday)
    .slice()
    .sort((a, b) => timeToMinutes(a.opensAt) - timeToMinutes(b.opensAt));

  const openRange = todayRanges.find(
    (h) => minutes >= timeToMinutes(h.opensAt) && minutes < timeToMinutes(h.closesAt),
  );
  if (openRange) {
    return { open: true, message: `Fecha às ${openRange.closesAt}` };
  }

  // Procura a próxima abertura: primeiro o resto de hoje (faixas que ainda
  // não começaram — ex.: agora são 12h30, reabre às 14h), depois os
  // próximos dias em ordem, dando a volta na semana inteira.
  for (let offset = 0; offset < 7; offset++) {
    const day = (weekday + offset) % 7;
    const ranges = bh
      .filter((h) => h.weekday === day)
      .slice()
      .sort((a, b) => timeToMinutes(a.opensAt) - timeToMinutes(b.opensAt));

    for (const range of ranges) {
      if (offset === 0 && timeToMinutes(range.opensAt) <= minutes) continue;
      const dayWord = offset === 0 ? 'hoje' : offset === 1 ? 'amanhã' : weekdayLabelsLower[day];
      return { open: false, message: `Abre ${dayWord} às ${range.opensAt}` };
    }
  }
  return { open: false, message: 'Confira os horários abaixo' };
});

// --- Prévia de conversa do card do WhatsApp ---
// Sequência de uma vez só (não em loop) ao montar: a pergunta da cliente
// chega primeiro, depois "digitando…" e então a resposta — uma troca rápida
// em vez de uma única mensagem estática, pra realmente parecer o início de
// uma conversa real acontecendo. prefers-reduced-motion pula
// direto pro estado final (as duas mensagens já visíveis, sem animação).
const chatBubbleState = ref<'hidden' | 'customer' | 'typing' | 'shown'>('hidden');
onMounted(() => {
  if (prefersReducedMotion()) {
    chatBubbleState.value = 'shown';
    return;
  }
  setTimeout(() => (chatBubbleState.value = 'customer'), 500);
  setTimeout(() => (chatBubbleState.value = 'typing'), 1700);
  setTimeout(() => (chatBubbleState.value = 'shown'), 3100);
});

// Print real da grade do perfil (@noelycerqueira) — arquivo estático em
// web/public/brand/instagram-grid.jpg, não uma URL externa: assim o card
// nunca depende do Instagram estar no ar nem quebra por causa de bloqueio
// de terceiros/CORS. Precisa ser atualizado manualmente de tempos em tempos
// pra continuar refletindo o feed atual.
const igGridImage = '/brand/instagram-grid.jpg';

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
          <DecorativeDots :count="6" tone="light" />
          <span class="contact-card__icon-wrap">
            <span class="contact-card__icon-ring contact-card__icon-ring--light" aria-hidden="true" />
            <span class="contact-card__icon contact-card__icon--whatsapp">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
                <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.39a9.9 9.9 0 0 0 4.76 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2Zm0 18.02a8.17 8.17 0 0 1-4.16-1.14l-.3-.18-3.13.82.84-3.05-.19-.31a8.13 8.13 0 0 1-1.25-4.35c0-4.5 3.66-8.16 8.19-8.16 4.52 0 8.19 3.66 8.19 8.16 0 4.51-3.67 8.21-8.19 8.21Zm4.48-6.13c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.78.95-.14.16-.28.18-.53.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.35-1.67-.14-.24-.02-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.42-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.11 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" />
              </svg>
            </span>
            <span class="contact-card__online-dot" aria-hidden="true" />
          </span>
          <h2>Fale pelo WhatsApp</h2>
          <p class="contact-card__hint">Resposta rápida, direto com a equipe da clínica.</p>

          <div class="whatsapp-thread">
            <Transition name="chat-bubble">
              <div v-if="chatBubbleState !== 'hidden'" class="whatsapp-preview whatsapp-preview--customer">
                <div class="whatsapp-preview__bubble whatsapp-preview__bubble--customer">
                  Oi! Gostaria de agendar um horário 💆‍♀️
                </div>
              </div>
            </Transition>
            <Transition name="chat-bubble">
              <div v-if="chatBubbleState === 'typing' || chatBubbleState === 'shown'" class="whatsapp-preview">
                <span class="whatsapp-preview__avatar" aria-hidden="true">NC</span>
                <div class="whatsapp-preview__bubble">
                  <span v-if="chatBubbleState === 'typing'" class="whatsapp-preview__typing" aria-hidden="true">
                    <span /><span /><span />
                  </span>
                  <span v-else>Olá! 😊 Me conta qual procedimento você tem interesse!</span>
                </div>
              </div>
            </Transition>
          </div>

          <WhatsAppButton
            v-if="settings.data?.whatsapp"
            variant="inline"
            label="Enviar mensagem"
          />
        </div>

        <a v-if="igHref" :href="igHref" target="_blank" rel="noopener" class="contact-card contact-card--instagram" data-icon-card>
          <DecorativeDots :count="8" tone="light" />
          <span class="instagram-sparkle instagram-sparkle--1" aria-hidden="true">✦</span>
          <span class="instagram-sparkle instagram-sparkle--2" aria-hidden="true">✦</span>
          <div class="instagram-header">
            <span class="contact-card__icon-wrap">
              <span class="contact-card__icon-ring contact-card__icon-ring--gold" aria-hidden="true" />
              <span class="contact-card__icon contact-card__icon--instagram">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
                </svg>
              </span>
            </span>
            <div class="instagram-header__text">
              <h2>Instagram</h2>
              <span class="contact-card__handle">{{ settings.data?.instagram }}</span>
            </div>
          </div>

          <div class="instagram-grid" aria-hidden="true">
            <img :src="igGridImage" alt="" loading="lazy" />
          </div>

          <span class="contact-card__cta">Ver perfil <span class="contact-card__cta-arrow" aria-hidden="true">→</span></span>
        </a>

        <div class="contact-card contact-card--hours" v-if="hours.length" data-icon-card>
          <DecorativeDots :count="6" tone="rose" />
          <span class="contact-card__icon-wrap">
            <span class="contact-card__icon-ring contact-card__icon-ring--rose" aria-hidden="true" />
            <span class="contact-card__icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
              </svg>
            </span>
          </span>
          <h2>Horário de funcionamento</h2>

          <span v-if="liveStatus" class="open-status" :class="liveStatus.open ? 'open-status--open' : 'open-status--closed'">
            <span class="open-status__dot" aria-hidden="true" />
            {{ liveStatus.open ? 'Aberto agora' : 'Fechado agora' }} · {{ liveStatus.message }}
          </span>

          <div class="week-strip" aria-hidden="true">
            <span
              v-for="(label, i) in weekdayShort"
              :key="i"
              class="week-strip__day"
              :class="{
                'week-strip__day--open': openWeekdays.has(i),
                'week-strip__day--today': i === nowClock.weekday,
              }"
            >
              {{ label }}
            </span>
          </div>

          <div class="contact-card__hours-list">
            <p
              v-for="h in hours"
              :key="h.label"
              :class="{ 'contact-card__hours-row--today': h.weekday === nowClock.weekday }"
            >
              <span class="contact-card__day">{{ h.label }}</span> {{ h.range }}
            </p>
          </div>
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

/* :not(.dots) exclui a raiz do DecorativeDots (novo filho direto do card do
   Instagram): o próprio componente já se posiciona position:absolute;inset:0
   sozinho — como o elemento raiz de um componente filho herda o atributo de
   escopo do PAI além do seu próprio, um reset genérico daqui (mesma
   especificidade) empataria com o position:absolute do componente e o
   resultado dependeria da ordem de carregamento dos dois <style scoped>, não
   do que faz sentido — :not() torna a exclusão determinística. */
.contact-card > *:not(.dots) {
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

/* --- Prévia de conversa (WhatsApp) --- */
.whatsapp-thread {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: var(--space-4);
}

.whatsapp-preview {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.whatsapp-preview--customer {
  justify-content: flex-end;
}

.whatsapp-preview__bubble--customer {
  background: color-mix(in srgb, var(--color-gold-500) 32%, white 68%);
  color: var(--color-rose-900);
  border-radius: var(--radius-md) var(--radius-md) 4px var(--radius-md);
}

.whatsapp-preview__avatar {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 700;
}

.whatsapp-preview__bubble {
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 10px 14px;
  min-height: 1.4em;
  display: flex;
  align-items: center;
  border-radius: var(--radius-md) var(--radius-md) var(--radius-md) 4px;
  box-shadow: var(--shadow-sm);
}

.whatsapp-preview__typing {
  display: inline-flex;
  gap: 3px;
}

.whatsapp-preview__typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-ink-soft);
  animation: whatsapp-typing 1.1s ease-in-out infinite;
}

.whatsapp-preview__typing span:nth-child(2) {
  animation-delay: 0.15s;
}

.whatsapp-preview__typing span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes whatsapp-typing {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.5;
  }
  30% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

.chat-bubble-enter-active {
  transition: opacity var(--duration-base) var(--ease-premium), transform var(--duration-base) var(--ease-premium);
}

.chat-bubble-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

@media (prefers-reduced-motion: reduce) {
  .whatsapp-preview__typing span {
    animation: none;
    opacity: 1;
  }
  .chat-bubble-enter-active {
    transition: none;
  }
}

/* --- Instagram: mesma linguagem visual do CTA de Instagram da Home
   (.instagram-card em HomeView.vue) — gradiente rosé escuro + dourado como
   acento de destaque, em vez de inventar um segundo estilo de card de
   Instagram diferente dentro do mesmo site. --- */
.contact-card--instagram {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
  border-color: transparent;
  color: #fff;
  text-decoration: none;
}

.contact-card--instagram::before {
  background: radial-gradient(220px circle at var(--spot-x) var(--spot-y), rgba(200, 164, 101, 0.22), transparent 70%);
}

.contact-card--instagram h2 {
  color: #fff;
}

.contact-card__icon--instagram {
  background: rgba(255, 255, 255, 0.16);
  color: var(--color-gold-100);
  box-shadow: inset 0 0 0 1.5px rgba(200, 164, 101, 0.5);
}

.contact-card__handle {
  display: block;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 600;
}

/* --- Cabeçalho do card de Instagram: ícone ao lado do texto (não empilhado
   em cima) — libera altura pra grade de fotos abaixo caber sem o card
   ficar desproporcionalmente alto. --- */
.instagram-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  position: relative;
  z-index: 1;
}

.instagram-header .contact-card__icon-wrap {
  margin-bottom: 0;
}

.instagram-header__text h2 {
  margin-bottom: 2px;
}

/* --- Print real do perfil (ver igGridImage no script): um recorte só da
   grade de posts, sem a barra de topo/bio do Instagram (o card já tem seu
   próprio cabeçalho com ícone+handle acima) nem o aviso de login que o
   Instagram mostra pra quem não está logado. --- */
.instagram-grid {
  /* Mesmo raciocínio de width:100% de antes (ver histórico): .contact-card
     --instagram é flex column com align-items:flex-start, então filhos não
     esticam à largura toda sozinhos. */
  width: 100%;
  position: relative;
  z-index: 1;
  margin-bottom: var(--space-4);
  border-radius: var(--radius-sm);
  overflow: hidden;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14);
}

.instagram-grid img {
  display: block;
  width: 100%;
  height: auto;
  transition: transform var(--duration-slow) var(--ease-premium);
}

.contact-card--instagram:hover .instagram-grid img {
  transform: scale(1.04);
}

.contact-card__cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-gold-100);
  font-weight: 700;
  font-size: 0.85rem;
}

.contact-card__cta-arrow {
  display: inline-block;
  transition: transform var(--duration-base) var(--ease-premium);
}

.contact-card--instagram:hover .contact-card__cta-arrow {
  transform: translateX(4px);
}

.contact-card--instagram:hover {
  border-color: transparent;
  box-shadow: var(--shadow-glow);
}

/* Anel pontilhado girando devagar ao redor do ícone — mesma assinatura
   visual do anel do hero (.hero__ring--gold em HomeView.vue), trazida aqui
   numa escala menor e agora nos TRÊS cards (cor do anel varia por
   modificador --gold/--rose/--light abaixo, ecoando a paleta de cada card),
   dando ao trio o mesmo acabamento "premium, vivo" do resto do site em vez
   de ícones estáticos dentro de círculos simples. */
.contact-card__icon-wrap {
  position: relative;
  width: 44px;
  height: 44px;
  margin-bottom: var(--space-4);
}

.contact-card__icon-wrap .contact-card__icon {
  margin-bottom: 0;
}

.contact-card__icon-ring {
  position: absolute;
  inset: -7px;
  border: 1.5px dashed;
  border-radius: 45% 55% 58% 42% / 45% 45% 55% 55%;
  opacity: 0.7;
  animation: icon-ring-spin 22s linear infinite;
  transition: opacity var(--duration-base) var(--ease-standard);
}

.contact-card:hover .contact-card__icon-ring {
  opacity: 1;
  animation-duration: 10s;
}

/* Genérico (não mais só Instagram): qualquer ícone dentro de um
   .contact-card__icon-wrap ganha o mesmo giro/escala sutil no hover do
   card inteiro — WhatsApp e Horário agora usam o mesmo wrap. */
.contact-card:hover .contact-card__icon-wrap .contact-card__icon {
  transform: scale(1.08) rotate(-4deg);
}

.contact-card__icon-wrap .contact-card__icon {
  transition: transform var(--duration-base) var(--ease-premium);
}

@keyframes icon-ring-spin {
  to {
    transform: rotate(360deg);
  }
}

.contact-card__icon-ring--gold {
  border-color: var(--color-gold-500);
}

.contact-card__icon-ring--rose {
  border-color: var(--color-rose-300);
}

.contact-card__icon-ring--light {
  border-color: rgba(255, 255, 255, 0.55);
}

/* Ponto "online" no card do WhatsApp — mesmo espírito do indicador "aberto
   agora" do card de Horário (uma pergunta que só uma lista estática de
   texto nunca respondia: "dá pra falar AGORA?"), só que aqui é uma resposta
   simples e honesta (a equipe responde em horário comercial, não um chat
   24h de verdade) — por isso um ponto discreto, não um badge de texto
   afirmando "online" que seria enganoso fora do horário de atendimento. */
.contact-card__online-dot {
  position: absolute;
  bottom: 1px;
  right: 1px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #25d366;
  border: 2px solid var(--color-rose-900);
  animation: online-dot-pulse 2.2s ease-in-out infinite;
}

@keyframes online-dot-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.55);
  }
  50% {
    box-shadow: 0 0 0 5px rgba(37, 211, 102, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .contact-card__online-dot {
    animation: none;
  }
}

.instagram-sparkle {
  position: absolute;
  color: var(--color-gold-500);
  animation: instagram-sparkle-float 5s ease-in-out infinite;
  pointer-events: none;
}

.instagram-sparkle--1 {
  top: var(--space-5);
  right: var(--space-6);
  font-size: 1rem;
}

.instagram-sparkle--2 {
  bottom: var(--space-6);
  right: var(--space-5);
  font-size: 0.7rem;
  animation-delay: 1.6s;
}

@keyframes instagram-sparkle-float {
  0%, 100% {
    transform: translateY(0) scale(1);
    opacity: 0.65;
  }
  50% {
    transform: translateY(-6px) scale(1.15);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .contact-card__icon-ring {
    animation: none;
  }
  .instagram-sparkle {
    animation: none;
    opacity: 0.8;
  }
  .contact-card:hover .contact-card__icon-wrap .contact-card__icon {
    transform: none;
  }
}

/* --- Horário: status "aberto agora" ao vivo + tira semanal --- */
.contact-card--hours {
  display: flex;
  flex-direction: column;
}

.open-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  font-size: 0.82rem;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  margin-bottom: var(--space-4);
}

.open-status__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.open-status--open {
  background: rgba(79, 122, 92, 0.12);
  color: var(--color-success);
}

.open-status--open .open-status__dot {
  background: var(--color-success);
  animation: open-status-pulse 2s ease-in-out infinite;
}

.open-status--closed {
  background: var(--color-surface-muted);
  color: var(--color-ink-muted);
}

.open-status--closed .open-status__dot {
  background: var(--color-ink-soft);
}

@keyframes open-status-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(79, 122, 92, 0.45);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(79, 122, 92, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .open-status--open .open-status__dot {
    animation: none;
  }
}

.week-strip {
  display: flex;
  gap: 4px;
  margin-bottom: var(--space-4);
}

.week-strip__day {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
  color: var(--color-ink-soft);
  font-size: 0.7rem;
  font-weight: 700;
}

.week-strip__day--open {
  background: var(--color-rose-100);
  color: var(--color-rose-700);
}

.week-strip__day--today {
  box-shadow: inset 0 0 0 1.5px var(--color-rose-700);
  color: var(--color-rose-900);
}

.contact-card__hours-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.contact-card__hours-list p {
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border-left: 2px solid transparent;
  transition: background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
}

/* Linha de hoje ganha destaque próprio — sem isso, a lista inteira lia como
   um bloco só de texto igual, obrigando a pessoa a caçar o dia atual na
   tira de dias acima e depois voltar pra achar a linha correspondente. */
.contact-card__hours-row--today {
  background: var(--color-rose-100);
  border-left-color: var(--color-rose-700);
}

.contact-card__hours-row--today .contact-card__day {
  color: var(--color-rose-900);
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
