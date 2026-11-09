import { onUnmounted } from 'vue';
import { gsap } from '@/lib/motion';

// Escopo de animação por componente: tudo que for criado dentro de
// `run(() => ...)` — tweens, timelines, ScrollTriggers, SplitTexts — fica
// registrado no mesmo gsap.context() e é desfeito de uma vez ao desmontar.
// Sem isso, cada visita a uma página deixava para trás os ScrollTriggers da
// visita anterior (apontando para elementos que já não existem no DOM), que
// continuavam sendo recalculados a cada refresh e a cada scroll.
// `run` pode ser chamado várias vezes (ex.: de novo depois de um fetch
// assíncrono) — cada chamada soma ao mesmo contexto. Precisa ser chamado
// de forma síncrona dentro do callback: o contexto só registra o que é
// criado enquanto a função passada está executando, não depois de um await.
export function useGsapContext() {
  const ctx = gsap.context(() => {});

  onUnmounted(() => ctx.revert());

  return {
    run<T>(fn: () => T): T {
      let result!: T;
      ctx.add(() => {
        result = fn();
      });
      return result;
    },
    ctx,
  };
}
