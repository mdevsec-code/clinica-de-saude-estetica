<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { gsap, prefersReducedMotion } from '@/lib/motion';
import { applyScrollReveal } from '@/composables/useScrollReveal';
import { applyPhotoReveal } from '@/composables/useStaggerReveal';
import { useHeroIntro } from '@/composables/useHeroIntro';
import { applySplitHeadingReveal } from '@/composables/useSplitReveal';
import { refreshScroll } from '@/composables/useSmoothScroll';
import { useGsapContext } from '@/composables/useGsapContext';
import { fetchCategories } from '@/services/catalog.service';
import { useSettingsStore } from '@/stores/settings';
import { instagramLink } from '@/services/settings.service';
import type { ServiceCategory } from '@/types';
import { FALLBACK_CATEGORIES } from '@/data/fallback';
import MarqueeRibbon from '@/components/MarqueeRibbon.vue';

useHeroIntro('.hero');

const settings = useSettingsStore();
settings.load();

const categories = ref<ServiceCategory[]>([]);
const motion = useGsapContext();
// Listeners de hover (tilt/magnético) não são tweens — o gsap.context não
// os conhece, então saem por aqui.
let cleanupHovers: Array<() => void> = [];
onUnmounted(() => cleanupHovers.forEach((fn) => fn()));

// "Como funciona" e "Diferenciais" entram como listas: cada item sobe em
// sequência quando a lista chega à tela — o título primeiro, depois o
// texto (a ordem de leitura), nunca o bloco inteiro de uma vez.
function animateLists() {
  if (prefersReducedMotion()) return;
  gsap.utils.toArray<HTMLElement>('[data-list-reveal]').forEach((list) => {
    const items = list.querySelectorAll(':scope > li');
    gsap.from(items, {
      y: 32,
      opacity: 0,
      duration: 1,
      stagger: 0.09,
      ease: 'premium-out',
      scrollTrigger: { trigger: list, start: 'top 82%', once: true },
    });
  });
}

// Profundidade nas fotos: a imagem anda um pouco mais devagar que a janela
// que a contém enquanto a página rola (scrub preso ao scroll).
function applyPhotoParallax() {
  if (prefersReducedMotion()) return;

  // O zoom de hover da foto usa a propriedade CSS `scale` (não `transform`)
  // justamente para conviver com este `transform` inline do GSAP.
  gsap.utils.toArray<HTMLElement>('.specialty-card__media').forEach((media) => {
    const photo = media.firstElementChild;
    if (!photo) return;
    gsap.fromTo(
      photo,
      { y: '-8%' },
      { y: '8%', ease: 'none', scrollTrigger: { trigger: media, start: 'top bottom', end: 'bottom top', scrub: true } },
    );
  });

  const featuredImg = document.querySelector('.featured__photo img');
  if (featuredImg) {
    gsap.fromTo(
      featuredImg,
      { scale: 1.16, yPercent: -5 },
      {
        scale: 1.02,
        yPercent: 5,
        ease: 'none',
        scrollTrigger: { trigger: '.featured', start: 'top bottom', end: 'bottom top', scrub: true },
      },
    );
  }
}

onMounted(async () => {
  try {
    const { categories: data } = await fetchCategories();
    categories.value = data.length ? data : FALLBACK_CATEGORIES;
  } catch {
    categories.value = FALLBACK_CATEGORIES;
  }

  // Tudo abaixo depende de conteúdo alimentado pela API (cards de
  // especialidade, o bloco de destaque): só existe no DOM depois que os
  // v-if liberam, então roda depois de um nextTick.
  await nextTick();
  motion.run(() => {
    applyScrollReveal('.home');
    applyPhotoReveal('.specialties', '.specialty-card--photo');
    applySplitHeadingReveal('[data-split]');
    animateLists();
    applyPhotoParallax();
  });
  cleanupHovers = [
  ];
  refreshScroll();
});

// Harmonização é o carro-chefe confirmado pela própria clínica — ganha uma
// seção de destaque só dela, logo depois do hero.
const featuredCategory = computed(() => categories.value.find((c) => c.featured) ?? null);

const igHref = computed(() => (settings.data?.instagram ? instagramLink(settings.data.instagram) : null));

// Mesmas fotos reais das categorias, reaproveitadas na prévia do Instagram
// em vez de fabricar conteúdo.
const igPreviewPhotos = computed(() =>
  categories.value
    .map((c) => c.imageUrl)
    .filter((url): url is string => !!url)
    .slice(0, 6),
);

const differentials = [
  { title: 'Atendimento individual', text: 'Cada procedimento pensado para a sua pele, o seu tempo e o seu conforto.' },
  { title: 'Ambiente acolhedor', text: 'Um espaço tranquilo, pensado do início ao fim para o seu bem-estar.' },
  { title: 'Agendamento simples', text: 'Escolha o serviço, a data e o horário em poucos toques, direto do celular.' },
];

// Ordem real (é um passo a passo), então lista ordenada de verdade — mas a
// ordem é dita pela posição e pelas palavras, não por "01 / 02 / 03".
const steps = [
  { title: 'Escolha o serviço', text: 'Navegue pelas especialidades e encontre o procedimento ideal para você.' },
  { title: 'Escolha o dia e o horário', text: 'Veja a agenda real da clínica e selecione o horário que encaixa na sua rotina.' },
  { title: 'Confirme e pronto', text: 'Informe seus dados e receba a confirmação do horário pelo WhatsApp.' },
];
</script>

<template>
  <div class="home">
    <!-- Hero: o título diz o que é; a frase logo abaixo diz quem, onde e
         como. A foto da Noely ocupa a metade direita da primeira tela. -->
    <section class="hero">
      <div class="container hero__grid">
        <div class="hero__text">
          <h1 class="hero__title">Estética e Micropigmentação</h1>
          <p class="hero__lead" data-hero-fade>
            Clínica de Saúde Estética Noely Cerqueira, em Camaçari (BA): cuidado personalizado, com técnica e atenção a cada
            detalhe.
          </p>
          <div class="hero__actions" data-hero-fade>
            <RouterLink to="/agendar" class="button button--primary">Agendar atendimento</RouterLink>
            <RouterLink to="/servicos" class="button button--ghost">Ver procedimentos</RouterLink>
          </div>
          <dl class="hero__facts" data-hero-fade>
            <div v-if="categories.length">
              <dt>{{ categories.length }}</dt>
              <dd>especialidades</dd>
            </div>
            <div>
              <dt>Online</dt>
              <dd>agendamento a qualquer hora</dd>
            </div>
            <div>
              <dt>Camaçari</dt>
              <dd>Bahia</dd>
            </div>
          </dl>
        </div>
        <figure class="hero__photo-wrap">
          <div class="hero__photo" data-parallax>
            <img src="/brand/noely-cerqueira-foto.jpeg" alt="Noely Cerqueira de jaleco branco, sorrindo" />
          </div>
          <figcaption class="hero__caption">Noely Cerqueira, especialista em estética</figcaption>
        </figure>
      </div>
    </section>

    <!-- Destaque: o carro-chefe em campo rosé, foto grande à esquerda. -->
    <section v-if="featuredCategory" class="featured">
      <div class="container featured__grid" data-reveal>
        <div class="featured__photo">
          <img v-if="featuredCategory.imageUrl" :src="featuredCategory.imageUrl" :alt="featuredCategory.name" />
        </div>
        <div class="featured__text">
          <h2 class="featured__title" data-split>{{ featuredCategory.name }}</h2>
          <p class="featured__description">
            O procedimento mais procurado da clínica: planejamento personalizado e técnica refinada para realçar a
            sua beleza natural com equilíbrio, do primeiro atendimento ao resultado.
          </p>
          <RouterLink to="/agendar" class="button button--primary">Agendar harmonização</RouterLink>
        </div>
      </div>
    </section>

    <!-- Sobre: campo escuro, título à esquerda, a frase da clínica em tipo
         grande à direita. -->
    <section class="about">
      <div class="container about__grid" data-reveal>
        <h2 data-split>Sobre a clínica</h2>
        <p class="about__statement">
          Estética e micropigmentação, da sobrancelha às massagens terapêuticas, com atendimento próximo, técnico e
          feito para você.
        </p>
      </div>
    </section>

    <section v-if="categories.length" class="specialties-section">
      <div class="container">
        <div class="specialties__heading">
          <h2 data-split>Especialidades</h2>
          <p class="specialties__lead" data-reveal>
            Um procedimento para cada etapa do seu cuidado, da limpeza de pele à micropigmentação.
          </p>
        </div>
        <div class="specialties">
          <RouterLink
            v-for="category in categories"
            :key="category.id"
            to="/servicos"
            class="specialty-card"
            :class="{ 'specialty-card--featured': category.featured, 'specialty-card--photo': category.imageUrl }"
          >
            <span v-if="category.imageUrl" class="specialty-card__media" aria-hidden="true">
              <span class="specialty-card__photo" :style="{ backgroundImage: `url(${category.imageUrl})` }" />
            </span>
            <span v-if="category.imageUrl" class="specialty-card__scrim" aria-hidden="true" />
            <span class="specialty-card__name">{{ category.name }}</span>
          </RouterLink>
        </div>
      </div>
    </section>

    <MarqueeRibbon />

    <section class="steps">
      <div class="container steps__grid">
        <div class="steps__heading">
          <h2 data-split>Como funciona o agendamento</h2>
          <RouterLink to="/agendar" class="button button--primary steps__cta">Agendar atendimento</RouterLink>
        </div>
        <ol class="steps__list" data-list-reveal>
          <li v-for="step in steps" :key="step.title">
            <h3>{{ step.title }}</h3>
            <p>{{ step.text }}</p>
          </li>
        </ol>
      </div>
    </section>

    <section class="values">
      <div class="container values__grid">
        <h2 data-split>Por que a Noely</h2>
        <ul class="values__list" data-list-reveal>
          <li v-for="item in differentials" :key="item.title">
            <h3>{{ item.title }}</h3>
            <p>{{ item.text }}</p>
          </li>
        </ul>
      </div>
    </section>

    <section v-if="igHref" class="instagram">
      <div class="container">
        <!-- Sem data-reveal: as configurações (o @ do Instagram) chegam da API
             depois que as entradas da página já foram preparadas — um card
             que nasce oculto ficaria oculto para sempre. -->
        <a :href="igHref" target="_blank" rel="noopener" class="instagram-card">
          <div v-if="igPreviewPhotos.length" class="instagram-card__grid" aria-hidden="true">
            <span
              v-for="(photo, i) in igPreviewPhotos"
              :key="i"
              class="instagram-card__cell"
              :style="{ backgroundImage: `url(${photo})` }"
            />
          </div>
          <div class="instagram-card__text">
            <h2 class="instagram-card__handle">{{ settings.data?.instagram }}</h2>
            <p>Procedimentos, resultados e bastidores da clínica no Instagram.</p>
            <span class="button button--light instagram-card__cta">Seguir no Instagram</span>
          </div>
        </a>
      </div>
    </section>

    <section class="cta-final" data-reveal>
      <div class="container cta-final__inner">
        <h2 data-split>Vamos agendar seu horário?</h2>
        <RouterLink to="/agendar" class="button button--light">Agendar atendimento</RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Campos de cor chapados, um por seção, sem degradê entre eles — creme
   (--color-bg), rosé claro, marrom escuro, rosé escuro. A troca de campo é
   o que separa as seções; nenhuma linha, sombra ou brilho faz isso. */

/* --- Hero --- */
.hero {
  position: relative;
  overflow: hidden;
  padding-block: var(--space-7) var(--space-9);
  background: var(--color-bg);
}

.hero__grid {
  display: grid;
  gap: var(--space-7);
  align-items: center;
}

.hero__title {
  font-size: clamp(2.8rem, 8.4vw + 0.4rem, 6.6rem);
  font-weight: 350;
  font-variation-settings: 'SOFT' 80, 'opsz' 144;
  letter-spacing: -0.03em;
  /* splitHeroTitle (useSplitReveal.ts) usa mask:'lines' — o line-height
     precisa deixar caber o acento do "É" e o pé do "ç"/"g". */
  line-height: 1.04;
  overflow-wrap: break-word;
  margin-bottom: var(--space-5);
  perspective: 700px;
  /* Nasce oculto: splitHeroTitle volta a mostrar no instante do split,
     depois da cortina de abertura (ver useHeroIntro). */
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .hero__title {
    opacity: 1;
  }
}

.hero__lead {
  color: var(--color-ink);
  font-size: 1.4rem;
  line-height: 1.5;
  max-width: 34ch;
  margin-bottom: var(--space-6);
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

/* Fatos: o número/nome em serifada grande, a explicação logo abaixo —
   separados por espaço, sem fio entre eles. */
.hero__facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-5) var(--space-7);
  margin: var(--space-7) 0 0;
}

.hero__facts dt {
  font-family: var(--font-serif);
  font-size: 2.2rem;
  font-weight: 350;
  line-height: 1;
  color: var(--color-rose-900);
}

.hero__facts dd {
  margin: 6px 0 0;
  font-size: 1.18rem;
  color: var(--color-ink-muted);
}

.hero__photo-wrap {
  position: relative;
  margin: 0;
  justify-self: stretch;
}

/* Deslocamento de profundidade com o cursor (useHeroIntro.ts escreve
   --px/--py via gsap.quickTo) — na propriedade `translate`, que se soma ao
   transform da saída de scroll sem anulá-lo. */
.hero__photo-wrap {
  translate: calc(var(--px, 0) * 1px) calc(var(--py, 0) * 1px);
}

/* A foto em arco ocupa a metade direita da primeira tela: é a pessoa
   por trás da clínica, o maior argumento da página. */
.hero__photo {
  width: 100%;
  max-width: 560px;
  margin-inline: auto;
  aspect-ratio: 4 / 5;
  border-radius: 999px 999px 0 0;
  overflow: hidden;
  background: var(--color-surface-muted);
  /* Mesmo estado inicial da timeline do hero (clip-path) — sem isso a foto
     aparecia pronta por um instante antes de se revelar. */
  clip-path: inset(100% 0% 0% 0%);
}

@media (prefers-reduced-motion: reduce) {
  .hero__photo {
    clip-path: none;
  }
}

.hero__photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 20%;
  display: block;
}

.hero__caption {
  max-width: 560px;
  margin: var(--space-3) auto 0;
  font-size: 1.1rem;
  color: var(--color-ink-muted);
}

/* --- Seções: ritmo comum --- */
.featured,
.about,
.specialties-section,
.steps,
.values,
.instagram,
.cta-final {
  position: relative;
  padding-block: var(--space-9);
}

h2 {
  font-size: var(--text-h2);
}

/* --- Destaque --- */
.featured {
  background: var(--color-rose-100);
  overflow: hidden;
}

.featured__grid {
  display: grid;
  gap: var(--space-7);
  align-items: center;
}

.featured__photo {
  aspect-ratio: 4 / 5;
  overflow: hidden;
  background: var(--color-rose-300);
}

.featured__photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.featured__title {
  margin-bottom: var(--space-5);
}

.featured__description {
  font-size: 1.35rem;
  line-height: 1.55;
  color: var(--color-ink);
  max-width: 38ch;
  margin-bottom: var(--space-6);
}

/* --- Sobre --- */
.about {
  background: var(--color-dusk-900);
}

.about__grid {
  display: grid;
  gap: var(--space-5);
}

.about h2 {
  color: #fff;
}

.about__statement {
  color: rgba(255, 255, 255, 0.88);
  max-width: 30ch;
  font-family: var(--font-serif);
  font-size: clamp(1.7rem, 1.6vw + 1rem, 2.6rem);
  font-weight: 300;
  font-variation-settings: 'SOFT' 100;
  line-height: 1.35;
  text-wrap: pretty;
}

/* --- Especialidades --- */
.specialties-section {
  background: var(--color-surface-muted);
}

.specialties__heading {
  display: grid;
  gap: var(--space-4);
  margin-bottom: var(--space-7);
}

.specialties__heading h2 {
  margin: 0;
}

.specialties__lead {
  color: var(--color-ink);
  font-size: 1.3rem;
  max-width: 40ch;
}

/* Mosaico: o destaque ocupa a coluna da esquerda em duas linhas de altura
   (no celular, a largura toda); grid-auto-flow:dense tampa qualquer vão se
   o número de categorias mudar no painel. */
.specialties {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-auto-flow: dense;
  gap: var(--space-3);
}

.specialty-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 180px;
  padding: var(--space-4);
  background: var(--color-surface);
  color: var(--color-rose-900);
  overflow: hidden;
}

.specialty-card--photo {
  aspect-ratio: 4 / 5;
  color: #fff;
  background: var(--color-dusk-800);
}

/* Janela da foto: a imagem é mais alta que o card — a sobra é o curso do
   parallax de scroll (applyPhotoParallax). */
.specialty-card__media {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.specialty-card__photo {
  position: absolute;
  inset: -12% 0;
  background-size: cover;
  background-position: center;
  /* `scale`, não `transform: scale()`: o parallax (GSAP) é dono do
     transform deste elemento, e as duas propriedades se compõem. */
  transition: scale 0.9s var(--ease-premium);
}

.specialty-card:hover .specialty-card__photo,
.specialty-card:focus-visible .specialty-card__photo {
  scale: 1.06;
}

/* Escurecimento neutro só na faixa de baixo, onde está o nome — a única
   forma de degradê permitida: legibilidade de texto sobre foto. */
.specialty-card__scrim {
  position: absolute;
  inset: 40% 0 0;
  background: linear-gradient(180deg, rgba(20, 12, 10, 0), rgba(20, 12, 10, 0.72));
  pointer-events: none;
}

.specialty-card__name {
  position: relative;
  font-family: var(--font-serif);
  font-size: 1.45rem;
  font-weight: 400;
  line-height: 1.15;
  letter-spacing: -0.01em;
}

.specialty-card--featured {
  grid-column: 1 / -1;
}

.specialty-card--featured.specialty-card--photo {
  aspect-ratio: 16 / 11;
}

.specialty-card--featured .specialty-card__name {
  font-size: clamp(1.8rem, 2.2vw + 1rem, 2.8rem);
}

/* Celular (2 colunas): com número par de categorias sobra um card sozinho
   na última linha — ele vira faixa larga, como o destaque. */
@media (max-width: 899px) {
  .specialty-card:last-child:nth-child(even):not(.specialty-card--featured) {
    grid-column: 1 / -1;
    aspect-ratio: 16 / 9;
  }
}

/* --- Como funciona --- */
.steps {
  background: var(--color-bg);
}

.steps__grid {
  display: grid;
  gap: var(--space-7);
}

.steps__heading h2 {
  margin-bottom: var(--space-5);
}

.steps__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-6);
}

.steps__list h3,
.values__list h3 {
  font-family: var(--font-serif);
  font-size: 1.9rem;
  font-weight: 400;
  letter-spacing: -0.01em;
  line-height: 1.15;
  margin-bottom: var(--space-2);
}

.steps__list p,
.values__list p {
  font-size: 1.2rem;
  line-height: 1.55;
  color: var(--color-ink);
  max-width: 42ch;
}

/* --- Diferenciais --- */
.values {
  background: var(--color-surface);
}

.values__grid {
  display: grid;
  gap: var(--space-6);
}

.values__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-6);
}

/* --- Instagram --- */
.instagram {
  background: var(--color-bg);
  padding-top: 0;
}

.instagram-card {
  display: grid;
  gap: var(--space-6);
  align-items: center;
  padding: var(--space-6);
  background: var(--color-rose-900);
  color: #fff;
}

.instagram-card__grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}

.instagram-card__cell {
  aspect-ratio: 1;
  background-size: cover;
  background-position: center;
  transition: scale var(--duration-slow) var(--ease-premium);
}

.instagram-card:hover .instagram-card__cell {
  scale: 1.04;
}

.instagram-card__handle {
  color: #fff;
  font-size: var(--text-h2);
  margin-bottom: var(--space-3);
}

.instagram-card__text p {
  font-size: 1.2rem;
  color: rgba(255, 255, 255, 0.86);
  margin-bottom: var(--space-5);
  max-width: 36ch;
}

/* --- CTA final: rosé escuro chapado; o rodapé continua no mesmo campo. --- */
.cta-final {
  background: var(--color-rose-900);
  color: #fff;
}

.cta-final__inner {
  display: grid;
  gap: var(--space-6);
  justify-items: start;
}

.cta-final h2 {
  color: #fff;
  font-size: var(--text-h1);
  max-width: 14ch;
}

@media (min-width: 700px) {
  .steps__list,
  .values__list {
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-6);
  }
}

@media (min-width: 900px) {
  .hero {
    padding-block: var(--space-6) var(--space-9);
  }

  .hero__grid {
    grid-template-columns: 1.05fr 0.95fr;
    gap: var(--space-8);
  }

  .featured__grid {
    grid-template-columns: 0.9fr 1.1fr;
    gap: var(--space-9);
  }

  .about__grid {
    grid-template-columns: 0.7fr 1.3fr;
    align-items: start;
    gap: var(--space-8);
  }

  .specialties__heading {
    grid-template-columns: 1fr 1fr;
    align-items: end;
  }

  .specialties {
    grid-template-columns: repeat(3, 1fr);
  }

  .specialty-card--featured {
    grid-column: span 1;
    grid-row: span 2;
  }

  .specialty-card--featured.specialty-card--photo {
    aspect-ratio: auto;
  }

  .specialty-card--photo {
    aspect-ratio: 5 / 4;
  }

  .steps__grid {
    grid-template-columns: 1fr;
  }

  .steps__heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: var(--space-6);
  }

  .steps__heading h2 {
    margin-bottom: 0;
    max-width: 14ch;
  }

  /* Título numa linha, os três diferenciais lado a lado abaixo dele, na
     largura toda — ao lado do título eles ficavam espremidos. */
  .values__list {
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-7);
  }

  .instagram-card {
    grid-template-columns: 0.9fr 1.1fr;
    gap: var(--space-8);
    padding: var(--space-7);
  }

  .cta-final__inner {
    grid-template-columns: 1fr auto;
    align-items: end;
  }
}
</style>
