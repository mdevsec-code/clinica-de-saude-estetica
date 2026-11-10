import { onMounted, onUnmounted } from 'vue';
import { gsap, ScrollTrigger, prefersReducedMotion, supportsFinePointer } from '@/lib/motion';
import { splitHeroTitle } from './useSplitReveal';
import { onAppIntroReady } from './useAppIntro';

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
  let removePointer: () => void = () => {};

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

    // Espera a cortina de abertura (AppIntroLoader) terminar antes de
    // encenar a própria entrada do hero — sem isso, esta timeline roda
    // escondida atrás da cortina desde o primeiro instante, e quando ela sai
    // de cena o hero já aparece "pronto" em vez de se revelar. Resolve
    // (quase) imediatamente fora do carregamento inicial: a cortina só
    // existe uma vez por sessão de SPA, então em qualquer outra montagem
    // (ex.: voltando para "/" por navegação interna) o portão já está aberto.
    onAppIntroReady(() => {
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

        // Depois da foto: o fundo rosé sobe atrás dela, o fio dourado se
        // DESENHA contornando o arco (base esquerda → topo → base direita)
        // e o cartão flutuante desliza para o lugar.
        const archBg = root.querySelector('.hero__arch-bg');
        const archLine = root.querySelector('.hero__arch-line path');
        const badge = root.querySelector('.hero__badge');
        if (archBg) tl.fromTo(archBg, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1.1 }, 0.35);
        if (archLine) tl.fromTo(archLine, { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.8, ease: 'premium-in-out' }, 0.5);
        if (badge) tl.fromTo(badge, { opacity: 0, x: -30, scale: 0.92 }, { opacity: 1, x: 0, scale: 1, duration: 0.9, ease: 'back.out(1.6)' }, 1.1);

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
        if (exit.scrollTrigger) scrollTriggers.push(exit.scrollTrigger);
      }

      // A foto sai bem mais devagar que o texto: o trajeto vai até o fim da
      // seção (não até a metade) e o ease "power2.in" a mantém quase inteira
      // na primeira parte da rolagem — a clínica pediu que ela não sumisse
      // tão rápido.
      if (photoWrap) {
        const photoExit = gsap.to(photoWrap, {
          opacity: 0,
          y: -30,
          scale: 0.94,
          ease: 'power2.in',
          scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: 0.8 },
        });
        if (photoExit.scrollTrigger) scrollTriggers.push(photoExit.scrollTrigger);
      }

      // Profundidade com o cursor: foto, anéis e estrelinhas são camadas a
      // distâncias diferentes — quanto mais "perto", mais se deslocam. As
      // camadas animadas aqui (anéis/estrelas) já têm @keyframes de giro em
      // `transform`, então o deslocamento vai nas propriedades independentes
      // `translate` via CSS custom property, para não brigar com o giro.
      if (photoWrap && supportsFinePointer()) {
        // Profundidade negativa = camada "atrás" (anda ao contrário do
        // cursor): o fundo rosé recua enquanto o fio dourado e o cartão
        // avançam, abrindo o espaço entre as camadas.
        const layer = (selector: string, depth: number) =>
          Array.from(photoWrap.querySelectorAll<HTMLElement>(selector)).map((el, i) => ({ el, depth: depth + i * 16 }));
        const layers = [
          { el: photoWrap, depth: 10 },
          ...layer('.hero__arch-bg', -14),
          ...layer('.hero__arch-line', 22),
          ...layer('.hero__badge', 30),
          ...layer('.hero__sparkle', 40),
        ].map(({ el, depth }) => ({
          depth,
          x: gsap.quickTo(el, '--px', { duration: 1.2, ease: 'power3.out' }),
          y: gsap.quickTo(el, '--py', { duration: 1.2, ease: 'power3.out' }),
        }));

        const onMove = (event: PointerEvent) => {
          const nx = event.clientX / window.innerWidth - 0.5;
          const ny = event.clientY / window.innerHeight - 0.5;
          layers.forEach((layer) => {
            layer.x(nx * layer.depth);
            layer.y(ny * layer.depth);
          });
        };
        window.addEventListener('pointermove', onMove, { passive: true });
        removePointer = () => window.removeEventListener('pointermove', onMove);
      }
    });
  });

  onUnmounted(() => {
    scrollTriggers.forEach((t) => t.kill());
    scrollTriggers = [];
    revertTitleSplit();
    removePointer();
  });
}
