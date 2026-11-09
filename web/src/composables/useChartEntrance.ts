import { nextTick, onMounted, onUnmounted, ref, watch, type WatchSource } from 'vue';
import { gsap, prefersReducedMotion } from '@/lib/motion';

// Entrada dos gráficos do painel: roda a animação ao montar e de novo
// sempre que os dados mudam (ex.: trocar o período 7d/14d/30d no Painel) —
// o gráfico se redesenha a partir do zero em vez de só pular para os
// valores novos. `animate` recebe o elemento raiz e cria os tweens; tudo
// fica num gsap.context, desfeito ao desmontar e antes de cada nova rodada
// (assim uma troca rápida de período não empilha animações).
export function useChartEntrance(source: WatchSource, animate: (root: HTMLElement) => void) {
  const root = ref<HTMLElement | null>(null);
  let ctx: gsap.Context | null = null;

  async function run() {
    await nextTick();
    if (!root.value || prefersReducedMotion()) return;
    ctx?.revert();
    ctx = gsap.context(() => animate(root.value!), root.value);
  }

  onMounted(run);
  watch(source, run, { deep: true });
  onUnmounted(() => ctx?.revert());

  return root;
}
