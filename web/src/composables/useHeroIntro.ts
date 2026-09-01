import { onMounted, onUnmounted } from 'vue';
import { gsap, ScrollTrigger, prefersReducedMotion } from '@/lib/motion';
import { splitHeroTitle } from './useSplitReveal';

// Timeline de entrada do hero: título em palavras (via SplitText, ver
// splitHeroTitle) sobe com giro 3D, depois o texto de apoio e os botões, e a
// foto aparece com uma revelação em "cortina" (clip-path). Por fim, ao
// rolar a página, o bloco inteiro do hero encolhe e esmaece suavemente
// (scrub preso à posição de scroll) enquanto a foto ganha profundidade — o
// mesmo tipo de efeito de "saída cinematográfica" usado em páginas de
// produto Apple. Tudo desabilitado quando prefers-reduced-motion está ativo.
export function useHeroIntro(rootSelector: string) {
  let scrollTriggers: ScrollTrigger[] = [];
  let revertTitleSplit: () => void = () => {};

  onMounted(() => {
    const root = document.querySelector<HTMLElement>(rootSelector);
    if (!root) return;

    const fadeIns = root.querySelectorAll<HTMLElement>('[data-hero-fade]');
    const photo = root.querySelector<HTMLElement>('[data-parallax]');
    const photoWrap = root.querySelector<HTMLElement>('.hero__photo-wrap');
    const heroText = root.querySelector<HTMLElement>('.hero__text');
    const title = root.querySelector<HTMLElement>('.hero__title');

    if (prefersReducedMotion()) {
      fadeIns.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      return;
    }

    if (title) revertTitleSplit = splitHeroTitle(title);

    const tl = gsap.timeline({ defaults: { ease: 'premium-out' }, delay: 0.15 });
    tl.fromTo(fadeIns, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.12 }, 0.55);

    if (photo) {
      // A própria .hero__photo já tem overflow:hidden + border-radius em
      // blob (ver HomeView.vue) — esse clip continua ativo em paralelo ao
      // clip-path abaixo (os dois se intersectam), então um inset()
      // retangular simples já basta para o "wipe" de revelação sem precisar
      // repetir a forma orgânica aqui também.
      tl.fromTo(
        photo,
        { clipPath: 'inset(100% 0% 0% 0%)', scale: 1.15 },
        { clipPath: 'inset(0% 0% 0% 0%)', scale: 1, duration: 1.3, ease: 'premium-out' },
        0.1,
      );

      // scrub:true liga o progresso do tween direto à posição de scroll —
      // não precisa (e não deve) recriar um tween a cada evento de scroll via
      // onUpdate, isso só gera jank e tweens concorrentes se sobrepondo.
      const parallax = gsap.to(photo, {
        y: -60,
        scale: 1.06,
        ease: 'none',
        scrollTrigger: {
          trigger: photo,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      });
      if (parallax.scrollTrigger) scrollTriggers.push(parallax.scrollTrigger);
    }

    // Saída cinematográfica: conforme o usuário começa a rolar a página, o
    // texto do hero recua/esmaece e a foto ganha leve profundidade —
    // encerrado bem antes do fim da seção para não brigar com o parallax
    // acima nem deixar a próxima seção "subindo por baixo" de algo ainda
    // visível.
    if (heroText || photoWrap) {
      const exit = gsap.timeline({
        scrollTrigger: {
          trigger: root,
          start: 'top top',
          end: '55% top',
          scrub: 0.6,
        },
      });
      if (heroText) exit.to(heroText, { opacity: 0, y: -50, scale: 0.96, ease: 'none' }, 0);
      if (photoWrap) exit.to(photoWrap, { opacity: 0, y: -30, scale: 0.92, ease: 'none' }, 0);
      if (exit.scrollTrigger) scrollTriggers.push(exit.scrollTrigger);
    }
  });

  onUnmounted(() => {
    scrollTriggers.forEach((t) => t.kill());
    scrollTriggers = [];
    revertTitleSplit();
  });
}
