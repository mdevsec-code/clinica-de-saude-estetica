<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { gsap, ScrollTrigger } from '@/lib/motion';
import { applyScrollReveal } from '@/composables/useScrollReveal';
import { applyStaggerReveal, useStaggerReveal } from '@/composables/useStaggerReveal';
import { useHeroIntro } from '@/composables/useHeroIntro';
import { applyTiltHover, useTiltHover } from '@/composables/useTiltHover';
import { applySplitHeadingReveal } from '@/composables/useSplitReveal';
import { applyMagneticButtons } from '@/composables/useMagneticButton';
import { applySpotlightHover, useSpotlightHover } from '@/composables/useSpotlightHover';
import { applyIconDraw } from '@/composables/useDrawIcon';
import { refreshScroll } from '@/composables/useSmoothScroll';
import { fetchCategories } from '@/services/catalog.service';
import { useSettingsStore } from '@/stores/settings';
import { instagramLink } from '@/services/settings.service';
import type { ServiceCategory } from '@/types';
import { FALLBACK_CATEGORIES } from '@/data/fallback';
import CategoryIcon from '@/components/CategoryIcon.vue';
import DecorativeDots from '@/components/DecorativeDots.vue';
import MarqueeRibbon from '@/components/MarqueeRibbon.vue';

useStaggerReveal('.differentials', '.differential');
useTiltHover('.differentials', '.differential');
useSpotlightHover('.differentials', '.differential');
useHeroIntro('.hero');

const settings = useSettingsStore();
settings.load();

const categories = ref<ServiceCategory[]>([]);

onMounted(async () => {
  try {
    const { categories: data } = await fetchCategories();
    categories.value = data.length ? data : FALLBACK_CATEGORIES;
  } catch {
    categories.value = FALLBACK_CATEGORIES;
  }

  // Tudo abaixo depende de conteúdo alimentado pela API (cards de
  // especialidade, o bloco de destaque em `.featured`): só existe no DOM
  // depois que os v-if acima liberam, então precisa rodar depois de um
  // nextTick — chamar mais cedo não encontraria nenhum elemento. Por isso
  // applyScrollReveal (não useScrollReveal) roda só aqui: um único
  // useScrollReveal('.home') no topo do componente rodaria ANTES desta
  // busca resolver e nunca encontraria `.featured__grid` — ele ficaria
  // com opacity:0 para sempre (regra global), mesmo com o restante do
  // conteúdo estático da Home revelado normalmente.
  await nextTick();
  applyScrollReveal('.home');
  applyStaggerReveal('.specialties', '.specialty-card');
  applyTiltHover('.specialties', '.specialty-card', 6);
  applySpotlightHover('.specialties', '.specialty-card');
  applyIconDraw('.specialties', '.specialty-card__icon svg');
  applyIconDraw('.featured', '.featured__icon svg', 0.3);
  applyIconDraw('.differentials', '.differential__icon svg');
  applySplitHeadingReveal('[data-split]');
  applyMagneticButtons('.button--primary');
  refreshScroll();

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const line = document.querySelector<HTMLElement>('.how-it-works__line-fill');
  if (line) {
    if (prefersReduced) {
      line.style.transform = 'scaleX(1)';
    } else {
      gsap.fromTo(
        line,
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 1,
          ease: 'power2.inOut',
          scrollTrigger: { trigger: '.how-it-works', start: 'top 70%' },
        },
      );
    }
  }
});

// Harmonização Facial e Corporal é o carro-chefe confirmado pela própria
// clínica — ganha uma seção de destaque só dela, logo depois do hero, em vez
// de aparecer só como mais um card igual aos outros na grade de especialidades.
const featuredCategory = computed(() => categories.value.find((c) => c.featured) ?? null);

const igHref = computed(() => (settings.data?.instagram ? instagramLink(settings.data.instagram) : null));

const differentials = [
  {
    title: 'Atendimento individual',
    text: 'Cada procedimento pensado para a sua pele, o seu tempo e o seu conforto.',
    icon: 'M12 21s-7-4.35-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6C19 16.65 12 21 12 21Z',
  },
  {
    title: 'Ambiente acolhedor',
    text: 'Um espaço tranquilo, pensado do início ao fim para o seu bem-estar.',
    icon: 'M4 21V10l8-6 8 6v11M9 21v-6h6v6',
  },
  {
    title: 'Agendamento simples',
    text: 'Escolha o serviço, a data e o horário em poucos toques, direto do celular.',
    icon: 'M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  },
];

const steps = [
  { number: '01', title: 'Escolha o serviço', text: 'Navegue pelas especialidades e encontre o procedimento ideal para você.' },
  { number: '02', title: 'Escolha o dia e o horário', text: 'Veja a agenda real da clínica e selecione o horário que encaixa na sua rotina.' },
  { number: '03', title: 'Confirme e pronto', text: 'Informe seus dados, confirme e receba os detalhes também pelo WhatsApp.' },
];
</script>

<template>
  <div class="home">
    <section class="hero">
      <DecorativeDots :count="14" />
      <div class="hero__glow" aria-hidden="true" />
      <div class="container hero__grid">
        <div class="hero__text">
          <p class="hero__eyebrow" data-hero-fade>Noely Cerqueira</p>
          <h1 class="hero__title">Estética e Micropigmentação</h1>
          <p class="hero__lead" data-hero-fade>
            Cuidado estético personalizado, com técnica e atenção aos detalhes, em Camaçari (BA).
          </p>
          <div class="hero__actions" data-hero-fade>
            <RouterLink to="/agendar" class="button button--primary">Agendar atendimento</RouterLink>
            <RouterLink to="/servicos" class="button button--ghost">Conhecer procedimentos</RouterLink>
          </div>
        </div>
        <div class="hero__photo-wrap">
          <div class="hero__photo" data-parallax>
            <img src="/brand/noely-cerqueira-foto.jpeg" alt="Noely Cerqueira" />
          </div>
          <span class="hero__ring" aria-hidden="true" />
          <span class="hero__ring hero__ring--gold" aria-hidden="true" />
          <span class="hero__sparkle hero__sparkle--1" aria-hidden="true">✦</span>
          <span class="hero__sparkle hero__sparkle--2" aria-hidden="true">✦</span>
        </div>
      </div>
      <div class="hero__scroll-cue" aria-hidden="true"><span /></div>
    </section>

    <section v-if="featuredCategory" class="section featured">
      <DecorativeDots :count="10" />
      <div class="container featured__grid" data-reveal>
        <div class="featured__photo-wrap">
          <div class="featured__photo">
            <img v-if="featuredCategory.imageUrl" :src="featuredCategory.imageUrl" :alt="featuredCategory.name" />
            <div v-else class="featured__icon" data-icon-card><CategoryIcon :slug="featuredCategory.slug" /></div>
          </div>
          <span class="featured__ring" aria-hidden="true" />
        </div>
        <div class="featured__text">
          <span class="featured__eyebrow">Destaque da clínica</span>
          <h2 class="featured__title" data-split>{{ featuredCategory.name }}</h2>
          <p class="featured__description">
            O procedimento mais procurado da Noely Cerqueira: planejamento personalizado e técnica
            refinada, para realçar sua beleza natural com equilíbrio e harmonia — do primeiro
            atendimento ao resultado.
          </p>
          <RouterLink to="/agendar" class="button button--primary">Agendar harmonização</RouterLink>
        </div>
      </div>
    </section>

    <section class="section section--dark">
      <div class="container section__about" data-reveal>
        <span class="section__quote-mark" aria-hidden="true">“</span>
        <h2 data-split>Sobre a clínica</h2>
        <p>
          A clínica da Noely Cerqueira reúne especialidades em estética e micropigmentação, com
          procedimentos que vão de sobrancelha e limpeza de pele a massagens terapêuticas — sempre
          com atendimento próximo, técnico e personalizado.
        </p>
      </div>
    </section>

    <section class="section section--muted" v-if="categories.length">
      <div class="container">
        <h2 data-split>Especialidades</h2>
        <div class="specialties">
          <RouterLink
            v-for="category in categories"
            :key="category.id"
            to="/servicos"
            class="specialty-card"
            data-icon-card
            :class="{ 'specialty-card--featured': category.featured, 'specialty-card--photo': category.imageUrl }"
            :style="category.imageUrl ? { backgroundImage: `url(${category.imageUrl})` } : undefined"
          >
            <span v-if="category.featured" class="specialty-card__badge">Destaque</span>
            <span v-if="category.imageUrl" class="specialty-card__scrim" aria-hidden="true" />
            <span class="specialty-card__icon"><CategoryIcon :slug="category.slug" /></span>
            <span class="specialty-card__name">{{ category.name }}</span>
            <span class="specialty-card__arrow" aria-hidden="true">→</span>
          </RouterLink>
        </div>
      </div>
    </section>

    <MarqueeRibbon />

    <section class="section how-it-works">
      <div class="container">
        <h2 data-split>Como funciona o agendamento</h2>
        <div class="how-it-works__line" aria-hidden="true"><span class="how-it-works__line-fill" /></div>
        <div class="how-it-works__steps">
          <div v-for="step in steps" :key="step.number" class="how-it-works__step" data-reveal>
            <span class="how-it-works__number">{{ step.number }}</span>
            <h3>{{ step.title }}</h3>
            <p>{{ step.text }}</p>
          </div>
        </div>
        <div class="how-it-works__cta" data-reveal>
          <RouterLink to="/agendar" class="button button--primary">Agendar atendimento</RouterLink>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2 data-split>Diferenciais</h2>
        <div class="differentials">
          <div v-for="item in differentials" :key="item.title" class="differential" data-icon-card>
            <span class="differential__icon">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path :d="item.icon" />
              </svg>
            </span>
            <h3>{{ item.title }}</h3>
            <p>{{ item.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <section v-if="igHref" class="section">
      <div class="container">
        <a :href="igHref" target="_blank" rel="noopener" class="instagram-card" data-reveal>
          <DecorativeDots :count="8" tone="light" />
          <div class="instagram-card__text">
            <span class="instagram-card__eyebrow">Instagram</span>
            <span class="instagram-card__handle">{{ settings.data?.instagram }}</span>
          </div>
          <span class="instagram-card__cta">Seguir →</span>
        </a>
      </div>
    </section>

    <section class="section cta-final" data-reveal>
      <span class="cta-final__glow" aria-hidden="true" />
      <DecorativeDots :count="16" tone="light" />
      <div class="container cta-final__inner">
        <h2 data-split>Pronta para agendar seu atendimento?</h2>
        <RouterLink to="/agendar" class="button button--primary">Agendar atendimento</RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* --- Hero --- */
.hero {
  position: relative;
  overflow: hidden;
  padding-block: var(--space-9) var(--space-9);
  /* background-color de base sob os dois gradientes: sem isso, as áreas fora
     do alcance de ambos ficam transparentes de verdade e mostram o fundo
     ambiente de forma inconsistente/desalinhada em vez de uma base sólida. */
  background-color: var(--color-bg);
  background-image: radial-gradient(circle at 20% 10%, var(--color-rose-100) 0%, transparent 55%),
    radial-gradient(circle at 85% 30%, var(--color-surface-muted) 0%, transparent 50%);
}

.hero__glow {
  position: absolute;
  inset: -20% -10% auto -10%;
  height: 60%;
  background: radial-gradient(ellipse at top, rgba(185, 124, 127, 0.18), transparent 70%);
  pointer-events: none;
}

.hero__grid {
  position: relative;
  display: grid;
  gap: var(--space-7);
}

.hero__eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.9rem;
  color: var(--color-rose-700);
  font-weight: 700;
  margin-bottom: var(--space-3);
}

.hero__title {
  /* Em telas muito estreitas (320-360px), "Micropigmentação" sozinha já é uma
     palavra longa — o mínimo aqui é deliberadamente mais contido que o resto
     da escala para não arriscar estourar a largura da tela mesmo com o
     overflow-wrap de segurança do global.css. */
  font-size: clamp(2rem, 7.5vw + 0.4rem, 5.4rem);
  /* splitHeroTitle (useSplitReveal.ts) também usa mask:'lines' — mesmo motivo
     do ajuste em [data-split]/global.css: sem isso, o topo de "Estética" e
     "Micropigmentação" ficava cortado pela máscara depois da animação. */
  line-height: 1.22;
  overflow-wrap: break-word;
  margin-bottom: var(--space-5);
  perspective: 700px;
}

.hero__lead {
  color: var(--color-ink-muted);
  font-size: 1.2rem;
  max-width: 46ch;
  margin-bottom: var(--space-6);
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.hero__photo-wrap {
  position: relative;
  justify-self: center;
}

.hero__photo {
  width: min(380px, 78vw);
  aspect-ratio: 4 / 5;
  border-radius: 42% 58% 55% 45% / 48% 42% 58% 52%;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
  position: relative;
  z-index: 2;
  background: var(--color-bg);
  /* border-radius + overflow:hidden sozinhos deixam uma franja cinza de
     anti-aliasing na borda orgânica no Chrome (bug antigo e conhecido do
     motor de renderização). Uma máscara com o mesmo raio força o navegador
     a suavizar a borda corretamente — é o fix definitivo, o border-radius
     acima cuida só do formato do box-shadow. */
  -webkit-mask-image: radial-gradient(white, black);
  mask-image: radial-gradient(white, black);
  /* Mesmo estado inicial que useHeroIntro.ts define via GSAP fromTo — precisa
     existir já no CSS (não só depois que o JS roda) porque a cortina de
     abertura (AppIntroLoader) desliza pra fora ANTES do onComplete que
     dispara essa timeline: sem isso, a foto ficava visível "pronta" por um
     instante enquanto a cortina saía de cena, e só depois era escondida e
     reanimada — lia como a foto/título carregando duas vezes. Revertido em
     prefers-reduced-motion (useHeroIntro.ts não anima nesse caso). */
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
  /* Sem isso o Chrome deixa uma franja cinza de anti-aliasing entre o
     border-radius orgânico do container e a borda reta da imagem
     recortada — replicar o mesmo raio na própria img elimina a costura. */
  border-radius: inherit;
  display: block;
}

.hero__ring {
  position: absolute;
  inset: -18px;
  border: 1.5px solid var(--color-rose-300);
  border-radius: 45% 55% 58% 42% / 45% 45% 55% 55%;
  z-index: 1;
  animation: ring-spin 26s linear infinite;
}

.hero__ring--gold {
  inset: -32px;
  border-color: var(--color-gold-500);
  opacity: 0.55;
  border-style: dashed;
  animation: ring-spin-reverse 40s linear infinite;
}

@keyframes ring-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes ring-spin-reverse {
  to {
    transform: rotate(-360deg);
  }
}

.hero__sparkle {
  position: absolute;
  z-index: 3;
  color: var(--color-gold-500);
  font-size: 1.1rem;
  animation: sparkle-float 5s ease-in-out infinite;
}

.hero__sparkle--1 {
  top: 6%;
  right: 4%;
  animation-delay: 0.4s;
}

.hero__sparkle--2 {
  bottom: 14%;
  left: -2%;
  font-size: 0.85rem;
  animation-delay: 1.6s;
}

@keyframes sparkle-float {
  0%, 100% {
    transform: translateY(0) scale(1);
    opacity: 0.7;
  }
  50% {
    transform: translateY(-8px) scale(1.15);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero__ring,
  .hero__ring--gold,
  .hero__sparkle {
    animation: none;
  }
}

.hero__scroll-cue {
  display: none;
}

/* --- Sections --- */
.section {
  padding-block: var(--space-8);
  position: relative;
}

.section--muted {
  /* Antes havia um SectionDivider (onda em SVG) entre `.section--dark` e esta
     seção — mesma classe de costura de subpixel já resolvida abaixo em
     `.cta-final` (ver comentário lá), só que aqui ainda não tinha sido
     corrigida: qualquer arredondamento de subpixel na borda curva da onda
     deixava uma linha de 1px da cor escura vazando bem na fronteira com o
     creme. Mesma solução — sem onda nenhuma: o próprio gradiente desta seção
     nasce na cor exata da seção anterior (--color-dusk-900) e clareia até
     --color-surface-muted só DENTRO da própria caixa, então não há fronteira
     entre dois elementos para uma costura aparecer. */
  background: linear-gradient(180deg, var(--color-dusk-900) 0%, var(--color-surface-muted) 12%, var(--color-surface-muted) 100%);
}

.section h2 {
  font-size: clamp(2rem, 4.6vw, 2.8rem);
  margin-bottom: var(--space-5);
}

.section__about {
  position: relative;
}

.section__quote-mark {
  font-family: var(--font-display);
  font-size: 5.5rem;
  color: var(--color-rose-500);
  line-height: 1;
  display: block;
}

.section__about p {
  color: rgba(255, 255, 255, 0.72);
  max-width: 64ch;
  font-size: 1.2rem;
  font-family: var(--font-display);
  font-weight: 500;
}

/* --- Sobre a clínica: seção de contraste dramático --- */
.section--dark {
  background: radial-gradient(circle at 15% 20%, var(--color-dusk-700) 0%, transparent 55%),
    var(--color-dusk-900);
  padding-block: var(--space-9);
}

.section--dark h2 {
  color: #fff;
}

/* --- Destaque (carro-chefe) --- */
.featured {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, var(--color-rose-100), var(--color-surface-muted));
}

.featured::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 8%;
  width: 320px;
  height: 320px;
  border-radius: 50%;
  transform: translateY(-50%);
  background: radial-gradient(circle, rgba(200, 164, 101, 0.16), transparent 70%);
  pointer-events: none;
}

.featured__grid {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
  text-align: center;
}

.featured__photo-wrap {
  position: relative;
  flex-shrink: 0;
}

.featured__photo {
  position: relative;
  z-index: 2;
  width: min(280px, 70vw);
  aspect-ratio: 1;
  border-radius: 42% 58% 55% 45% / 48% 42% 58% 52%;
  overflow: hidden;
  -webkit-mask-image: radial-gradient(white, black);
  mask-image: radial-gradient(white, black);
  box-shadow: var(--shadow-lg);
  border: 3px solid var(--color-surface);
}

.featured__photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
  display: block;
}

.featured__icon {
  width: 100%;
  height: 100%;
  background: var(--color-surface);
  color: var(--color-rose-700);
  display: flex;
  align-items: center;
  justify-content: center;
}

.featured__icon svg {
  width: 58px;
  height: 58px;
}

.featured__ring {
  position: absolute;
  inset: -14px;
  z-index: 1;
  border: 1.5px dashed var(--color-gold-500);
  border-radius: 45% 55% 58% 42% / 45% 45% 55% 55%;
  opacity: 0.6;
}

.featured__eyebrow {
  display: block;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-gold-700);
  margin-bottom: var(--space-2);
}

.featured__title {
  margin-bottom: var(--space-3);
}

.featured__description {
  color: var(--color-ink-muted);
  font-size: 1.08rem;
  max-width: 52ch;
  margin-inline: auto;
  margin-bottom: var(--space-5);
}

@media (min-width: 780px) {
  .featured__grid {
    flex-direction: row;
    text-align: left;
    gap: var(--space-8);
  }

  .featured__photo {
    width: 320px;
  }

  .featured__description {
    margin-inline: 0;
  }
}

/* --- Especialidades --- */
.specialties {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
}

.specialty-card {
  --spot-x: 50%;
  --spot-y: 0%;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5) var(--space-4);
  color: var(--color-rose-900);
  transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard), transform var(--duration-base) var(--ease-premium);
}

/* Cards com foto de categoria: a imagem cobre o card inteiro (background,
   não <img>, porque o holofote/tilt já usa transform no próprio elemento —
   um <img> filho exigiria object-fit + z-index extra sem ganhar nada) e o
   texto sobe para branco sobre um escurecimento gradual no rodapé, alto o
   bastante para o nome/seta continuarem legíveis em qualquer foto. */
.specialty-card--photo {
  aspect-ratio: 3 / 4;
  justify-content: flex-end;
  background-size: cover;
  background-position: center;
  color: #fff;
  border-color: transparent;
}

.specialty-card__scrim {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, rgba(28, 18, 16, 0.05) 0%, rgba(28, 18, 16, 0.15) 45%, rgba(28, 18, 16, 0.82) 100%);
  pointer-events: none;
}

.specialty-card--photo:hover {
  border-color: transparent;
  transform: translateY(-4px);
}

.specialty-card::before {
  /* Sem overflow:hidden no .specialty-card de propósito: o selo "Destaque"
     (ver .specialty-card__badge) precisa poder ultrapassar a borda superior
     do card (top negativo) para flutuar como uma fita — overflow:hidden ali
     cortaria o selo pela metade. O próprio raio da borda do ::before abaixo
     já é suficiente para conter o brilho do holofote na prática (o
     radial-gradient já esmaece bem antes de alcançar os cantos). */
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 0;
  background: radial-gradient(220px circle at var(--spot-x) var(--spot-y), var(--color-rose-100), transparent 70%);
  transition: opacity var(--duration-base) var(--ease-premium);
  pointer-events: none;
}

.specialty-card.is-spotlit::before {
  opacity: 1;
}

.specialty-card:hover {
  border-color: var(--color-rose-500);
  box-shadow: var(--shadow-md);
}

.specialty-card--featured {
  border-color: var(--color-rose-700);
  box-shadow: var(--shadow-sm);
}

.specialty-card__badge {
  position: absolute;
  top: -10px;
  right: var(--space-3);
  overflow: hidden;
  background: linear-gradient(135deg, var(--color-gold-700), var(--color-gold-500));
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-sm);
  z-index: 1;
}

.specialty-card__badge::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.55) 48%, transparent 66%);
  transform: translateX(-140%);
  animation: badge-shine 3.2s ease-in-out infinite;
}

@keyframes badge-shine {
  0%, 40% {
    transform: translateX(-140%);
  }
  70%, 100% {
    transform: translateX(140%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .specialty-card__badge::after {
    animation: none;
    display: none;
  }
}

.specialty-card__icon {
  position: relative;
  z-index: 1;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--color-rose-100);
  color: var(--color-rose-700);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
}

.specialty-card--photo .specialty-card__icon {
  position: absolute;
  top: var(--space-4);
  left: var(--space-4);
}

.specialty-card__name {
  position: relative;
  z-index: 1;
  font-weight: 700;
}

.specialty-card--photo .specialty-card__name {
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

.specialty-card__arrow {
  position: relative;
  z-index: 1;
  color: var(--color-rose-500);
  font-weight: 700;
  margin-top: auto;
  transition: transform var(--duration-base) var(--ease-premium);
}

.specialty-card--photo .specialty-card__arrow {
  color: #fff;
  /* margin-top:auto (regra base, logo abaixo) existe para empurrar só a
     seta para o rodapé quando ela é o ÚLTIMO item de uma coluna com nome+
     ícone todos em fluxo normal (variante sem foto). Na variante com foto o
     ícone saiu do fluxo (position:absolute) e é o próprio container que já
     empurra nome+seta para baixo via justify-content:flex-end — um
     margin-top:auto aqui absorveria sozinho todo o espaço livre ANTES do
     justify-content agir, colando o nome no topo do card (por trás do
     ícone) em vez de ficar ao lado da seta no rodapé. */
  margin-top: 0;
}

.specialty-card:hover .specialty-card__arrow {
  transform: translateX(4px);
}

/* --- Como funciona --- */
.how-it-works__line {
  position: relative;
  height: 1px;
  background: var(--color-border);
  margin-bottom: var(--space-6);
  display: none;
}

.how-it-works__line-fill {
  position: absolute;
  inset: 0;
  background: var(--color-rose-700);
  transform: scaleX(0);
  transform-origin: left;
}

.how-it-works__steps {
  display: grid;
  gap: var(--space-6);
}

.how-it-works__step {
  transition: transform var(--duration-base) var(--ease-premium);
}

.how-it-works__step:hover {
  transform: translateY(-4px);
}

.how-it-works__number {
  font-family: var(--font-display);
  font-size: 1.7rem;
  font-weight: 600;
  color: var(--color-rose-700);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--color-surface);
  border: 1.5px solid var(--color-rose-300);
  box-shadow: var(--shadow-sm);
  margin-bottom: var(--space-3);
}

.how-it-works__step h3 {
  font-size: 1.2rem;
  margin-bottom: var(--space-2);
}

.how-it-works__step p {
  color: var(--color-ink-muted);
}

.how-it-works__cta {
  margin-top: var(--space-7);
  text-align: center;
}

/* --- Diferenciais --- */
.differentials {
  display: grid;
  gap: var(--space-5);
}

.differential {
  --spot-x: 50%;
  --spot-y: 0%;
  position: relative;
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  transition: transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.differential::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0;
  background: radial-gradient(220px circle at var(--spot-x) var(--spot-y), var(--color-rose-100), transparent 70%);
  transition: opacity var(--duration-base) var(--ease-premium);
  pointer-events: none;
}

.differential.is-spotlit::before {
  opacity: 1;
}

.differential:hover {
  /* Sem transform aqui de propósito: em dispositivos com mouse, o GSAP
     (useTiltHover) já controla o transform deste elemento para a inclinação
     3D + leve escala — uma regra de :hover competindo pelo mesmo transform
     nunca venceria um estilo inline, então só geraria confusão. Em touch ou
     com prefers-reduced-motion (onde o GSAP nem entra em ação), a borda e a
     sombra abaixo já dão o feedback de hover. */
  box-shadow: var(--shadow-md);
}

.differential__icon {
  position: relative;
  z-index: 1;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--color-rose-100);
  color: var(--color-rose-700);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-4);
}

.differential h3 {
  position: relative;
  z-index: 1;
  font-size: 1.2rem;
  margin-bottom: var(--space-2);
}

.differential p {
  position: relative;
  z-index: 1;
  color: var(--color-ink-muted);
}

/* --- Instagram --- */
.instagram-card {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
  color: #fff;
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  transition: transform var(--duration-base) var(--ease-premium), box-shadow var(--duration-base) var(--ease-premium);
}

.instagram-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-glow);
}

.instagram-card__eyebrow {
  display: block;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.8rem;
  opacity: 0.8;
  margin-bottom: var(--space-1);
}

.instagram-card__handle {
  font-family: var(--font-display);
  font-size: 1.6rem;
}

.instagram-card__cta {
  font-weight: 700;
  align-self: flex-start;
  border: 1px solid rgba(255, 255, 255, 0.6);
  padding: 10px 20px;
  border-radius: var(--radius-pill);
}

/* --- CTA final ---
   Antes havia um SectionDivider (onda em SVG) entre a seção do Instagram e
   esta — como as duas caixas terminam/começam exatamente na mesma cor
   (bg-before = --color-bg = fundo da seção anterior), qualquer arredondamento
   de subpixel na borda da onda deixava uma linha de 1px visível bem no meio
   do que devia ser um gradiente contínuo. Trocado por uma solução sem junta
   nenhuma: o PRÓPRIO gradiente desta seção já nasce na cor da seção anterior
   (--color-bg) e escurece até o rosé só DENTRO da própria caixa — não hÁ
   fronteira entre dois elementos para uma costura aparecer. O brilho animado
   abaixo (mesma técnica de "aurora" do AmbientBackground.vue) substitui a
   onda estática por uma transição com movimento próprio. */
.cta-final {
  position: relative;
  overflow: hidden;
  background: linear-gradient(
    180deg,
    var(--color-bg) 0%,
    var(--color-rose-900) 18%,
    var(--color-rose-900) 55%,
    var(--color-rose-700) 100%
  );
  color: #fff;
  /* Mesmo raciocínio: a base desta seção termina exatamente na cor onde o
     rodapé começa (ver AppFooter.vue) — o overlap evita a mesma classe de
     costura de subpixel nessa segunda junta. */
  margin-bottom: -1px;
}

.cta-final__glow {
  position: absolute;
  top: -10%;
  left: 50%;
  width: min(900px, 140%);
  height: 60%;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(200, 164, 101, 0.28), transparent 70%);
  filter: blur(10px);
  animation: cta-glow-drift 14s ease-in-out infinite;
  pointer-events: none;
}

@keyframes cta-glow-drift {
  0%, 100% {
    transform: translateX(-50%) translateY(0) scale(1);
    opacity: 0.85;
  }
  50% {
    transform: translateX(-50%) translateY(3%) scale(1.12);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cta-final__glow {
    animation: none;
  }
}

.cta-final__inner {
  position: relative;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
}

.cta-final h2 {
  color: #fff;
}

@media (min-width: 900px) {
  .hero__grid {
    grid-template-columns: 1.1fr 0.9fr;
    align-items: center;
  }

  .hero__scroll-cue {
    display: block;
    position: absolute;
    bottom: var(--space-5);
    left: 50%;
    transform: translateX(-50%);
  }

  .hero__scroll-cue span {
    display: block;
    width: 1px;
    height: 40px;
    background: linear-gradient(var(--color-rose-500), transparent);
  }

  .specialties {
    grid-template-columns: repeat(5, 1fr);
  }

  .how-it-works__line {
    display: block;
  }

  .how-it-works__steps {
    grid-template-columns: repeat(3, 1fr);
  }

  .differentials {
    grid-template-columns: repeat(3, 1fr);
  }

  .instagram-card {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}
</style>
