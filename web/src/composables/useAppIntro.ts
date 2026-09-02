import { ref } from 'vue';

// Portão simples para coordenar a cortina de abertura (AppIntroLoader) com a
// timeline de entrada do hero (useHeroIntro): sem isso, os dois GSAP
// timelines rodam em paralelo desde o onMounted de cada um, e o hero termina
// de se revelar ESCONDIDO atrás da cortina — quando ela sai de cena, o
// conteúdo já aparece "pronto" em vez de encenar sua própria entrada.
// Estado em nível de módulo (não um ref exportado direto) porque
// AppIntroLoader e useHeroIntro montam em componentes irmãos sem relação de
// pai/filho — não há como passar isso por prop/provide de forma simples.
const ready = ref(false);
const pending = new Set<() => void>();

export function markAppIntroReady() {
  if (ready.value) return;
  ready.value = true;
  pending.forEach((callback) => callback());
  pending.clear();
}

// Chama `callback` imediatamente se a cortina já terminou (ou nunca vai
// rodar, ex.: rota admin); senão enfileira para rodar assim que
// markAppIntroReady() disparar.
export function onAppIntroReady(callback: () => void) {
  if (ready.value) {
    callback();
    return;
  }
  pending.add(callback);
}
