import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { SplitText } from 'gsap/SplitText';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { CustomEase } from 'gsap/CustomEase';
import { CustomBounce } from 'gsap/CustomBounce';
import { Flip } from 'gsap/Flip';
import { Observer } from 'gsap/Observer';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

// Ponto único de registro de plugins GSAP + definição das curvas de easing
// autorais do site. Todo composable/componente deve importar gsap (e os
// plugins) DAQUI, nunca direto de 'gsap' — um módulo ES só executa uma vez
// não importa quantas vezes seja importado, então isso garante que
// CustomEase.create() rode exatamente uma vez (chamar de novo com o mesmo
// nome não quebra, mas registrar plugin espalhado em vários arquivos torna
// fácil esquecer um import e ter um plugin faltando silenciosamente).
gsap.registerPlugin(
  ScrollTrigger,
  ScrollSmoother,
  SplitText,
  DrawSVGPlugin,
  CustomEase,
  CustomBounce,
  Flip,
  Observer,
  MotionPathPlugin,
  ScrollToPlugin,
);

// Assinatura de movimento do site: uma saída "expo" bem suave (o mesmo
// espírito de easing usado em produtos Apple) para revelações de conteúdo,
// e uma entrada/saída simétrica para interações de hover/estado.
CustomEase.create('premium-out', '0.16, 1, 0.3, 1');
CustomEase.create('premium-in-out', '0.65, 0, 0.35, 1');
CustomBounce.create('premium-bounce', { strength: 0.5, squash: 1.2, endAtStart: false });

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const supportsFinePointer = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export { gsap, ScrollTrigger, ScrollSmoother, SplitText, DrawSVGPlugin, Flip, Observer, MotionPathPlugin };
