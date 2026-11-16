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
// Aceita link de playlist (toca em sequência) ou de um vídeo: aí toca a
// rádio (mix) do YouTube a partir dele, passando para outras músicas.
const musicSrc = computed(() => {
  const raw = site.get('tv.playlist').trim();
  const params = 'autoplay=1&loop=1&playsinline=1&rel=0';
  const list = raw.match(/[?&]list=([\w-]{10,64})/)?.[1] ?? (/^(PL|OL|RD)[\w-]{8,62}$/.test(raw) ? raw : null);
  if (list) return `https://www.youtube.com/embed/videoseries?list=${list}&${params}`;
  const video = raw.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([\w-]{11})/)?.[1] ?? (/^[\w-]{11}$/.test(raw) ? raw : null);
  return video ? `https://www.youtube.com/embed/${video}?list=RD${video}&autoplay=1&playsinline=1&rel=0` : null;
});
const musicOn = ref(false);
const startMusic = () => (musicOn.value = true);
const index = ref(0);

const priceLabel = (price: number | null) =>
  price == null ? 'Mediante avaliação' : price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const slides = computed<Slide[]>(() => {
  const list: Slide[] = [];
  for (const c of categories.value) {
    const services = c.services; // todos os procedimentos ativos, na ordem do painel
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
  <div class="tv" :class="{ 'tv--music': musicSrc }">
    <Transition name="tv-fade">
      <section v-if="current" :key="current.key" class="tv__slide">
        <!-- Foto inteira (sem corte) sobre um fundo desfocado dela mesma. -->
        <div class="tv__photo">
          <template v-if="current.image">
            <img :src="current.image" alt="" class="tv__photo-bg" />
            <img :src="current.image" alt="" class="tv__photo-img" />
          </template>
        </div>

        <div class="tv__panel">
          <div class="tv__content">
            <template v-if="current.kind === 'category'">
              <p class="tv__eyebrow">Especialidade</p>
              <h1 class="tv__title tv__title--big">{{ current.title }}</h1>
              <p class="tv__lead">{{ current.count }} {{ current.count === 1 ? 'procedimento' : 'procedimentos' }}</p>
            </template>

            <template v-else-if="current.kind === 'service'">
              <p class="tv__eyebrow">{{ current.category }}</p>
              <h1 class="tv__title">{{ current.title }}</h1>
              <p v-if="current.description" class="tv__lead">{{ current.description }}</p>
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
            </template>

            <template v-else>
              <h1 class="tv__title tv__title--big">{{ current.title }}</h1>
              <ul class="tv__contacts">
                <li v-if="phone">WhatsApp {{ phone }}</li>
                <li v-if="settings.data?.instagram">Instagram {{ settings.data.instagram }}</li>
              </ul>
            </template>
          </div>
        </div>
      </section>
    </Transition>

    <!-- Fixos, no painel vinho (nada por cima das fotos): logo no alto e, no
         pé, o QR para agendar — com música, o player fica ao lado do QR. -->
    <img v-if="!musicSrc" src="/brand/logo-noely-cerqueira.png" alt="Noely Cerqueira" class="tv__logo" />

    <div class="tv__book">
      <p v-if="musicSrc" class="tv__book-caption"><strong>Agende pelo celular:</strong> aponte a câmera para o código</p>
      <div class="tv__book-row">
        <img src="/brand/qr-agendar.svg" alt="" class="tv__qr" />
        <div v-if="musicSrc" class="tv__music">
          <iframe
            v-if="musicOn"
            :src="musicSrc"
            title="Música da clínica"
            allow="autoplay; encrypted-media"
          />
          <p v-else class="tv__music-hint">♪ Aperte OK no controle para tocar a música</p>
        </div>
        <p v-else>
          <strong>Agende pelo celular</strong>
          Aponte a câmera para o código
          <span>noelycerqueira.com.br</span>
        </p>
      </div>
    </div>

    <div v-if="current" :key="`bar-${current.key}`" class="tv__progress" :style="{ animationDuration: `${current.ms}ms` }" />

    <!-- Próxima foto já carregando, para a troca não piscar. -->
    <img v-if="next?.image" :src="next.image" alt="" class="tv__preload" />
  </div>
</template>

<style scoped>
/* Cores fixas (não seguem o modo escuro do site): a TV é sempre igual.
   Medidas em vw (desenho em 1920×1080), margens largas porque TVs cortam
   as bordas. */
.tv {
  --wine: #6f3d43;
  --deep: #1c1210;
  --rose: #f3ddd6;
  --gold: #c8a465;
  --edge: 3vw;
  --photo-w: 58vw;
  --pad: 3.2vw; /* margem interna do painel */
  --player-w: max(356px, 22vw); /* mínimo do YouTube: 356×200 */
  --player-h: calc(var(--player-w) * 9 / 16);
  --qr: 13vw;
  --top-h: 7vw; /* espaço da logo no alto do painel */
  --book-h: var(--qr); /* altura do bloco do QR no pé do painel */
  position: fixed;
  inset: 0;
  overflow: hidden;
  /* Fundo igual aos dois lados do slide: na troca não pisca. */
  background: linear-gradient(90deg, var(--deep) var(--photo-w), var(--wine) var(--photo-w));
  color: #fff;
  cursor: none;
}

.tv__slide {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: var(--photo-w) 1fr;
}

.tv--music {
  /* Com música o painel alarga o necessário para QR + player lado a lado
     (a foto continua com a altura toda); sem logo, para sobrar espaço. */
  --photo-w: min(58vw, calc(100vw - 2 * var(--pad) - var(--qr) - 1.4vw - var(--player-w)));
  --qr: 10vw;
  --top-h: 0vw;
  --book-h: calc(2.6vw + max(var(--qr), var(--player-h)));
}

.tv__photo {
  position: relative;
  height: 100%;
  overflow: hidden;
  background: var(--deep);
}

.tv__photo-bg {
  position: absolute;
  inset: -5%;
  width: 110%;
  height: 110%;
  object-fit: cover;
  filter: blur(40px) brightness(0.55) saturate(1.2);
}

.tv__photo-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  animation: tv-zoom 10s ease-out both;
}

@keyframes tv-zoom {
  from { transform: scale(1.05); }
  to { transform: scale(1); }
}

.tv__panel {
  display: flex;
  flex-direction: column;
  /* Logo no alto e QR no pé ficam fixos, fora do slide: reserva o espaço. */
  padding: calc(var(--edge) + var(--top-h)) var(--pad) calc(var(--edge) + var(--book-h) + 1.5vw) var(--pad);
  background: var(--wine);
}

.tv__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 0;
}

.tv__eyebrow {
  margin: 0 0 1vw;
  font-size: 1.5vw;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--gold);
}

.tv__title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: min(4vw, 6vh);
  font-weight: 400;
  line-height: 1.05;
  color: #fff;
  text-wrap: balance;
}

.tv__title--big {
  font-size: min(5vw, 9vh);
}

.tv__lead {
  margin: 1.6vw 0 0;
  font-size: 1.7vw;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.88);
}

.tv__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 1.2vw 3vw;
  margin: min(2.4vw, 3vh) 0 0;
}

.tv__facts dt {
  font-size: 1.15vw;
  color: var(--rose);
}

.tv__facts dd {
  margin: 0.3vw 0 0;
  font-size: min(2.1vw, 4vh);
  font-weight: 600;
  color: #fff;
}

.tv__contacts {
  list-style: none;
  margin: 2vw 0 0;
  padding: 0;
  font-size: 1.8vw;
  line-height: 1.8;
  white-space: nowrap;
}

.tv__logo {
  position: absolute;
  top: var(--edge);
  left: calc(var(--photo-w) + var(--pad));
  z-index: 3;
  width: 9vw;
  padding: 0.7vw 1vw;
  border-radius: 0.8vw;
  background: rgba(255, 253, 251, 0.94);
}

.tv__book {
  position: absolute;
  left: calc(var(--photo-w) + var(--pad));
  right: var(--pad);
  bottom: var(--edge);
  z-index: 3;
}

.tv__book-row {
  display: flex;
  align-items: center;
  gap: 1.4vw;
}

.tv__book-caption {
  margin: 0 0 0.9vw;
  font-size: 1.3vw;
  white-space: nowrap;
  color: var(--rose);
}

.tv__book-caption strong {
  display: inline;
  margin: 0;
  font-size: inherit;
}

.tv__qr {
  flex: none;
  width: var(--qr);
  height: var(--qr);
  padding: 0.6vw;
  border-radius: 0.8vw;
  background: #fff;
}

.tv__book p {
  margin: 0;
  font-size: 1.3vw;
  line-height: 1.4;
  color: var(--rose);
}

.tv__book strong {
  display: block;
  margin-bottom: 0.3vw;
  font-size: 1.9vw;
  color: #fff;
}

.tv__book span {
  display: block;
  margin-top: 0.5vw;
  font-size: 1.3vw;
  font-weight: 600;
  color: #fff;
}

/* Player do YouTube (mínimo 356×200 pelas regras do YouTube). */
.tv__music {
  flex: none;
  width: var(--player-w);
  height: var(--player-h);
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.tv__music iframe {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0.6vw;
  box-shadow: 0 0.6vw 2vw rgba(0, 0, 0, 0.45);
}

.tv__music-hint {
  margin: 0;
  padding: 0.7vw 1.2vw;
  border-radius: 999px;
  background: rgba(28, 18, 16, 0.8);
  font-size: 1.1vw;
  color: #fff;
}

.tv__progress {
  position: absolute;
  left: 0;
  bottom: 0;
  z-index: 5;
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

.tv__preload {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

/* O slide que sai some antes do novo entrar: textos nunca se sobrepõem. */
.tv-fade-leave-active {
  transition: opacity 0.45s ease;
}

.tv-fade-enter-active {
  transition: opacity 0.8s ease 0.45s;
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
