<script setup lang="ts">
// Apresentação para a TV da recepção (Fire TV → navegador Silk → /tv).
// Passa sozinha, em loop, por todos os procedimentos ativos do site, com
// os dados do mesmo catálogo do site (preço, foto e ordem mudam no painel e
// a TV acompanha). Desenhada em 1920×1080 com medidas em vw, para caber em
// qualquer TV; margens largas porque muitas TVs cortam as bordas.
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { fetchCategories } from '@/services/catalog.service';
import { useSettingsStore } from '@/stores/settings';
import { useSiteContentStore } from '@/stores/siteContent';
import { assetUrl } from '@/utils/images';
import type { ServiceCategory } from '@/types';

interface Slide {
  key: string;
  kind: 'category' | 'service' | 'cta';
  title: string;
  category?: string;
  image: string | null;
  count?: number;
  duration?: number;
  price?: string;
  description?: string | null;
  ms: number;
}

const SERVICE_MS = 8000;
const CATEGORY_MS = 6000;
const CTA_MS = 12000;
const REFRESH_MS = 30 * 60_000; // busca o catálogo de novo
const RELOAD_MS = 6 * 60 * 60_000; // recarrega a página (versão nova do site, memória limpa)

const categories = ref<ServiceCategory[]>([]);
const settings = useSettingsStore();
const site = useSiteContentStore();

// Música: playlist do YouTube escolhida em Painel → Site. O navegador só deixa
// tocar som depois de um toque, então espera o OK do controle remoto. O player
// fica visível num canto (as regras do YouTube não permitem escondê-lo).
const playlistId = computed(() => {
  const raw = site.get('tv.playlist').trim();
  const id = raw.match(/[?&]list=([\w-]+)/)?.[1] ?? raw;
  return /^[\w-]{10,64}$/.test(id) ? id : null;
});
const musicOn = ref(false);
const startMusic = () => (musicOn.value = true);
const index = ref(0);

// Avaliação (repetida em toda categoria) e retornos não são procedimentos
// para divulgar: a avaliação vira o slide final, de chamada para agendar.
const skip = (name: string) => /^(avalia|retorno)/i.test(name.trim());
const priceLabel = (price: number | null) =>
  price == null ? 'Mediante avaliação' : price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const slides = computed<Slide[]>(() => {
  const list: Slide[] = [];
  for (const c of categories.value) {
    const services = c.services.filter((s) => !skip(s.name));
    if (!services.length) continue;
    list.push({ key: `c-${c.id}`, kind: 'category', title: c.name, image: assetUrl(c.imageUrl), count: services.length, ms: CATEGORY_MS });
    for (const s of services) {
      list.push({
        key: `s-${s.id}`,
        kind: 'service',
        title: s.name,
        category: c.name,
        image: assetUrl(s.imageUrl ?? c.imageUrl),
        duration: s.durationMinutes,
        price: priceLabel(s.price),
        description: s.description && !/mediante avalia/i.test(s.description) ? s.description : null,
        ms: SERVICE_MS,
      });
    }
  }
  list.push({ key: 'cta', kind: 'cta', title: 'Agende sua avaliação', image: '/brand/noely-consultorio.jpg', ms: CTA_MS });
  return list;
});

const current = computed(() => slides.value[index.value % Math.max(slides.value.length, 1)]);
const next = computed(() => slides.value[(index.value + 1) % Math.max(slides.value.length, 1)]);

const phone = computed(() => {
  const d = (settings.data?.whatsapp ?? '').replace(/\D/g, '').replace(/^55/, '');
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d;
});

let slideTimer: ReturnType<typeof setTimeout> | undefined;
function schedule() {
  clearTimeout(slideTimer);
  slideTimer = setTimeout(() => {
    index.value = (index.value + 1) % slides.value.length;
    schedule();
  }, current.value?.ms ?? SERVICE_MS);
}

async function loadCatalog() {
  site.load(true);
  try {
    const { categories: data } = await fetchCategories();
    if (data.length) categories.value = data;
  } catch {
    // sem rede: continua com o catálogo que já tem
  }
}

// Mantém a tela acesa onde o navegador deixa (o protetor de tela do Fire TV
// também deve ser desligado nas configurações).
let wakeLock: { release: () => Promise<void> } | null = null;
async function keepAwake() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (document.visibilityState === 'visible' && nav.wakeLock) wakeLock = await nav.wakeLock.request('screen');
  } catch {
    // sem suporte: segue sem
  }
}

let refreshTimer: ReturnType<typeof setInterval> | undefined;
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
onMounted(async () => {
  document.documentElement.classList.add('tv-mode');
  settings.load();
  await loadCatalog();
  schedule();
  keepAwake();
  document.addEventListener('visibilitychange', keepAwake);
  document.addEventListener('keydown', startMusic, { once: true });
  document.addEventListener('pointerdown', startMusic, { once: true });
  refreshTimer = setInterval(loadCatalog, REFRESH_MS);
  reloadTimer = setTimeout(() => location.reload(), RELOAD_MS);
});
onUnmounted(() => {
  document.documentElement.classList.remove('tv-mode');
  clearTimeout(slideTimer);
  clearInterval(refreshTimer);
  clearTimeout(reloadTimer);
  document.removeEventListener('visibilitychange', keepAwake);
  document.removeEventListener('keydown', startMusic);
  document.removeEventListener('pointerdown', startMusic);
  wakeLock?.release().catch(() => {});
});
</script>

<template>
  <div class="tv">
    <Transition name="tv-fade">
      <section v-if="current" :key="current.key" class="tv__slide" :class="`tv__slide--${current.kind}`">
        <div class="tv__photo">
          <img v-if="current.image" :src="current.image" alt="" />
        </div>

        <div v-if="current.kind === 'category'" class="tv__category">
          <p class="tv__eyebrow">Especialidade</p>
          <h1>{{ current.title }}</h1>
          <p class="tv__count">{{ current.count }} {{ current.count === 1 ? 'procedimento' : 'procedimentos' }}</p>
        </div>

        <div v-else-if="current.kind === 'service'" class="tv__panel">
          <p class="tv__eyebrow">{{ current.category }}</p>
          <h1>{{ current.title }}</h1>
          <p v-if="current.description" class="tv__description">{{ current.description }}</p>
          <dl class="tv__facts">
            <div>
              <dt>Duração</dt>
              <dd>{{ current.duration }} min</dd>
            </div>
            <div>
              <dt>Valor</dt>
              <dd>{{ current.price }}</dd>
            </div>
          </dl>
        </div>

        <div v-else class="tv__panel tv__panel--cta">
          <h1>{{ current.title }}</h1>
          <p class="tv__description">Aponte a câmera do celular para o código e escolha o dia e o horário.</p>
          <div class="tv__cta-row">
            <img src="/brand/qr-agendar.svg" alt="" class="tv__qr tv__qr--big" />
            <div class="tv__contacts">
              <p>noelycerqueira.com.br</p>
              <p v-if="phone">WhatsApp {{ phone }}</p>
              <p v-if="settings.data?.instagram">{{ settings.data.instagram }}</p>
            </div>
          </div>
        </div>
      </section>
    </Transition>

    <footer v-if="current && current.kind !== 'cta'" class="tv__footer">
      <img src="/brand/logo-noely-cerqueira.png" alt="Noely Cerqueira" class="tv__logo" />
      <div class="tv__book">
        <span>Agende pelo site<strong>noelycerqueira.com.br</strong></span>
        <img src="/brand/qr-agendar.svg" alt="" class="tv__qr" />
      </div>
    </footer>

    <div v-if="playlistId && current" class="tv__music" :class="`tv__music--${current.kind}`">
      <iframe
        v-if="musicOn"
        :src="`https://www.youtube.com/embed/videoseries?list=${playlistId}&autoplay=1&loop=1&playsinline=1&rel=0`"
        title="Música da clínica"
        allow="autoplay; encrypted-media"
      />
      <p v-else class="tv__music-hint">♪ Aperte OK no controle para tocar a música</p>
    </div>

    <div v-if="current" :key="`bar-${current.key}`" class="tv__progress" :style="{ animationDuration: `${current.ms}ms` }" />

    <!-- Próxima foto já carregando, para a troca não piscar. -->
    <img v-if="next?.image" :src="next.image" alt="" class="tv__preload" />
  </div>
</template>

<style scoped>
/* Cores fixas (não seguem o modo escuro do site): a TV é sempre igual. */
.tv {
  --wine: #6f3d43;
  --deep: #1c1210;
  --rose: #f3ddd6;
  --gold: #c8a465;
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: var(--deep);
  color: #fff;
  cursor: none;
}

.tv__slide {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 56% 44%;
}

.tv__photo {
  position: relative;
  overflow: hidden;
  background: var(--wine);
}

.tv__photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  animation: tv-zoom 12s ease-out both;
}

@keyframes tv-zoom {
  from { transform: scale(1.12); }
  to { transform: scale(1); }
}

/* Especialidade: foto na tela toda, nome grande por cima. */
.tv__slide--category {
  grid-template-columns: 1fr;
}

.tv__slide--category .tv__photo {
  grid-area: 1 / 1;
}

.tv__slide--category .tv__photo::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(28, 18, 16, 0.85) 0%, rgba(28, 18, 16, 0.35) 60%, rgba(28, 18, 16, 0.1) 100%);
}

.tv__category {
  grid-area: 1 / 1;
  z-index: 1;
  align-self: center;
  padding: 0 6vw;
  max-width: 60vw;
}

.tv__category h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 7.2vw;
  font-weight: 400;
  line-height: 1;
  color: #fff;
}

.tv__count {
  margin: 2vw 0 0;
  font-size: 2vw;
  color: var(--rose);
}

/* Procedimento: foto à esquerda, ficha à direita em campo vinho. */
.tv__panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 5vw 5vw 9vw 4.5vw;
  background: var(--wine);
}

.tv__eyebrow {
  margin: 0 0 1.2vw;
  font-size: 1.5vw;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--gold);
}

.tv__panel h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 4.6vw;
  font-weight: 400;
  line-height: 1.05;
  color: #fff;
  text-wrap: balance;
}

.tv__description {
  margin: 1.8vw 0 0;
  font-size: 1.6vw;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.85);
  max-width: 32ch;
}

.tv__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 1.4vw 3.5vw;
  margin: 3vw 0 0;
}

.tv__facts dt {
  font-size: 1.15vw;
  color: var(--rose);
}

.tv__facts dd {
  margin: 0.3vw 0 0;
  font-size: 2.2vw;
  font-weight: 600;
  color: #fff;
}

/* Chamada final. */
.tv__panel--cta {
  padding-bottom: 5vw;
}

.tv__cta-row {
  display: flex;
  align-items: center;
  gap: 2.5vw;
  margin-top: 3vw;
}

.tv__contacts p {
  margin: 0 0 0.8vw;
  white-space: nowrap;
  font-size: 1.7vw;
  color: #fff;
}

/* Rodapé fixo: marca e QR para agendar. */
.tv__footer {
  position: absolute;
  left: 4.5vw;
  right: 4.5vw;
  bottom: 3.5vw;
  z-index: 2;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  pointer-events: none;
}

.tv__logo {
  width: 13vw;
  padding: 0.8vw 1.2vw;
  border-radius: 0.8vw;
  background: rgba(255, 253, 251, 0.92);
}

.tv__book {
  display: flex;
  align-items: center;
  gap: 1.2vw;
  font-size: 1.1vw;
  color: var(--rose);
  text-align: right;
}

.tv__book strong {
  display: block;
  font-size: 1.4vw;
  color: #fff;
}

.tv__qr {
  width: 6.5vw;
  height: 6.5vw;
  padding: 0.4vw;
  border-radius: 0.6vw;
  background: #fff;
}

.tv__qr--big {
  width: 13vw;
  height: 13vw;
}

.tv__progress {
  position: absolute;
  left: 0;
  bottom: 0;
  z-index: 3;
  height: 0.35vw;
  width: 100%;
  background: var(--gold);
  transform-origin: left;
  animation: tv-progress linear both;
}

@keyframes tv-progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

.tv__music {
  position: absolute;
  z-index: 4;
  top: 3vw;
  width: max(356px, 22vw);
  aspect-ratio: 16 / 9;
  transition: left 0.8s ease, right 0.8s ease, top 0.8s ease;
}

/* Sempre sobre a foto, longe dos textos: no procedimento a foto fica à
   esquerda; na especialidade o texto fica à esquerda; no final, embaixo. */
.tv__music--service {
  left: 3vw;
}

.tv__music--category {
  left: calc(100vw - 3vw - max(356px, 22vw));
}

.tv__music--cta {
  left: 3vw;
  top: calc(100vh - 3vw - max(356px, 22vw) * 9 / 16);
}

.tv__music iframe {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0.6vw;
  box-shadow: 0 0.6vw 2vw rgba(0, 0, 0, 0.4);
}

.tv__music-hint {
  display: inline-block;
  margin: 0;
  padding: 0.7vw 1.2vw;
  border-radius: 999px;
  background: rgba(28, 18, 16, 0.75);
  font-size: 1.1vw;
  color: #fff;
}

.tv__preload {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.tv-fade-enter-active,
.tv-fade-leave-active {
  transition: opacity 1s ease;
}

.tv-fade-enter-from,
.tv-fade-leave-to {
  opacity: 0;
}
</style>

<style>
/* Esconde o cursor próprio do site e a barra de rolagem na TV. */
html.tv-mode,
html.tv-mode body {
  overflow: hidden;
  cursor: none !important;
}
</style>
