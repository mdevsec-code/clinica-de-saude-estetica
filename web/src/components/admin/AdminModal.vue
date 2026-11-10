<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { gsap, prefersReducedMotion } from '@/lib/motion';

// wide: conteúdo em duas colunas (ex.: comanda), cabe inteiro sem rolar.
defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);
const backdrop = ref<HTMLElement | null>(null);

onMounted(() => {
  // Registrado antes do retorno antecipado: com prefers-reduced-motion o
  // Esc também precisa fechar (antes o listener só existia com animação).
  document.addEventListener('keydown', onKeydown);
  if (prefersReducedMotion()) return;

  gsap.fromTo(backdrop.value, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power1.out' });
  gsap
    .timeline({ defaults: { ease: 'premium-out' } })
    .fromTo(panel.value, { opacity: 0, y: 32, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.5 })
    // O conteúdo assenta logo depois da moldura — cabeçalho e campos chegam
    // em sequência curta, em vez de o formulário inteiro aparecer de bloco.
    .from(
      panel.value?.querySelectorAll('.admin-modal__header, .admin-modal__body > *') ?? [],
      { opacity: 0, y: 12, duration: 0.45, stagger: 0.04 },
      0.12,
    );
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
});

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') requestClose();
}

// Fechamento iniciado pelo próprio modal (X, clique fora, Esc): anima a
// saída e só então avisa o pai, que remove o modal com v-if. Antes ele
// sumia de uma vez, sem a contrapartida da entrada animada. Fechamentos
// decididos pelo pai (ex.: depois de salvar) continuam imediatos.
let closing = false;
function requestClose() {
  if (closing) return;
  closing = true;
  if (prefersReducedMotion() || !panel.value) {
    emit('close');
    return;
  }
  gsap
    .timeline({ onComplete: () => emit('close') })
    .to(panel.value, { opacity: 0, y: 20, scale: 0.97, duration: 0.25, ease: 'power2.in' }, 0)
    .to(backdrop.value, { opacity: 0, duration: 0.25, ease: 'power1.in' }, 0.05);
}
</script>

<template>
  <Teleport to="#overlay-slot">
    <div ref="backdrop" class="admin-modal__backdrop" @click.self="requestClose">
      <div ref="panel" class="admin-modal__panel" :class="{ 'admin-modal__panel--wide': wide }" role="dialog" aria-modal="true" :aria-label="title">
        <header class="admin-modal__header">
          <h2>{{ title }}</h2>
          <button type="button" class="admin-modal__close" aria-label="Fechar" @click="requestClose">✕</button>
        </header>
        <div class="admin-modal__body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.admin-modal__backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(28, 18, 16, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}

.admin-modal__panel {
  width: 100%;
  max-width: 560px;
  max-height: min(680px, 90vh);
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-float);
  overflow: hidden;
}

.admin-modal__panel--wide {
  max-width: 920px;
  max-height: 94vh;
}

.admin-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.admin-modal__header h2 {
  font-size: 1.2rem;
  /* Sem text-transform:capitalize: os títulos passados por quem usa este
     modal já vêm com a capitalização correta em português (só a primeira
     letra, ex.: "Novo agendamento" ou um dayLabel() já formatado) — um
     capitalize aqui forçaria toda palavra a maiúscula, inclusive
     preposições ("Novo Agendamento", "01 De Setembro De 2026"), errado. */
}

.admin-modal__close {
  flex-shrink: 0;
  /* A regra global de touch target (button { min-height: 44px }, ver
     global.css) já esticava a ALTURA deste botão pra 44px sem esticar a
     largura — resultado era uma "pílula" oval de 32x44 em vez de um círculo.
     Fixar os dois lados em --touch-target-min mantém o botão circular e dá
     uma área de toque adequada nas duas dimensões. */
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  border-radius: 50%;
  border: 1px solid var(--color-border);
  background: none;
  color: var(--color-ink-muted);
  cursor: pointer;
  font-size: 0.9rem;
}

.admin-modal__close:hover {
  border-color: var(--color-rose-500);
  color: var(--color-rose-700);
}

.admin-modal__body {
  padding: var(--space-5);
  overflow-y: auto;
}
</style>
