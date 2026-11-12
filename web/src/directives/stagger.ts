import type { Directive } from 'vue';
import { gsap, prefersReducedMotion } from '@/lib/motion';

// v-stagger: assenta os filhos diretos do elemento em sequência curta no
// instante em que ele entra no DOM. Pensado para o painel, onde o bloco de
// conteúdo de cada aba (lista de pacientes, gastos, itens de estoque...)
// só é montado pelo v-else quando os dados chegam — o hook `mounted` da
// diretiva dispara exatamente nesse momento, sem cada view precisar
// observar o próprio `loading`.
//
// Só transform, NUNCA opacity: é a regra que resolveu o "painel fica
// branco" na troca de aba (ver histórico em AdminLayout.vue) — o conteúdo
// nasce 100% opaco e legível desde o primeiro frame, apenas deslizando e
// assentando no lugar. clearProps devolve o transform ao CSS ao final, para
// os :hover dos cards (translateY) voltarem a funcionar.
//
// Valor opcional: `v-stagger="'.seletor'"` anima esses descendentes em vez
// dos filhos diretos (ex.: grades aninhadas num wrapper).
// Listas longas: só os primeiros 14 itens entram em sequência — o resto já
// está fora da tela e animá-los só atrasaria o fim da animação.
// Modificador `.grid` (calendário da Agenda): todos os itens, numa onda
// diagonal a partir do canto superior esquerdo — o stagger `grid:'auto'`
// do GSAP lê a posição real de cada célula na tela.
export const vStagger: Directive<HTMLElement, string | undefined> = {
  // A revelação geral do painel (useAdminMotion: esconde cartões abaixo da
  // dobra até a rolagem chegar) disputava os mesmos cartões e deixava alguns
  // presos invisíveis — na Auditoria sobrava um buraco no lugar do primeiro
  // registro. Lista com v-stagger fica só com esta entrada (nunca opacity).
  beforeMount(el) {
    el.setAttribute('data-own-motion', '');
  },
  mounted(el, binding) {
    if (prefersReducedMotion()) return;
    const items = binding.value ? Array.from(el.querySelectorAll<HTMLElement>(binding.value)) : Array.from(el.children as HTMLCollectionOf<HTMLElement>);
    if (!items.length) return;

    if (binding.modifiers.grid) {
      gsap.from(items, {
        y: 14,
        scale: 0.94,
        duration: 0.6,
        stagger: { each: 0.018, grid: 'auto', from: 'start' },
        ease: 'premium-out',
        clearProps: 'transform',
      });
      return;
    }

    const visible = items.slice(0, 14);
    gsap.from(visible, {
      y: 22,
      scale: 0.985,
      duration: 0.7,
      stagger: 0.04,
      ease: 'premium-out',
      clearProps: 'transform',
    });
  },
};
