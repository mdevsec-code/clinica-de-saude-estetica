<script setup lang="ts">
// Busca rápida (Ctrl/Cmd+K) pra pular direto pra qualquer aba do painel sem
// precisar caçar na nav — mesmo espírito do Cmd+K de ferramentas como
// Linear/Notion/Vercel. Diferente da tira de estatísticas (ver AdminLayout,
// atalhos pra 3 números específicos): isso é navegação genérica pra
// QUALQUER seção, incluindo as que não têm pílula de atalho nenhuma
// (Serviços, Usuários, Auditoria).
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

interface CommandItem {
  label: string;
  hint: string;
  name: string;
  // Mesmo markup interno (rect/path/circle) já usado nos ícones da nav do
  // AdminLayout — reaproveitado via v-html (conteúdo 100% estático,
  // escrito por nós, nunca dado de usuário, então sem risco de XSS real)
  // pra manter os dois conjuntos de ícone visualmente idênticos sem
  // reescrever cada um como path único.
  iconInner: string;
}

const ICON_DASHBOARD = '<rect x="3" y="3" width="7" height="9" rx="1.2" /><rect x="14" y="3" width="7" height="5" rx="1.2" /><rect x="14" y="12" width="7" height="9" rx="1.2" /><rect x="3" y="16" width="7" height="5" rx="1.2" />';
const ICON_CATALOG = '<path d="M20.5 12.5 12.5 20.5a2 2 0 0 1-2.83 0l-6.17-6.17a2 2 0 0 1 0-2.83L11.5 3.5H19a1.5 1.5 0 0 1 1.5 1.5Z" /><circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />';
const ICON_AGENDA = '<rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />';
const ICON_FINANCE = '<rect x="2.5" y="6" width="19" height="13" rx="2" /><path d="M2.5 10h19M6 15h4" />';
const ICON_INVENTORY = '<path d="M3 9.5 12 4l9 5.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /><path d="M8 21v-7h8v7" />';
const ICON_USERS = '<circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16.5 5.5a3.2 3.2 0 0 1 0 6.4M21.5 20a6 6 0 0 0-5-6.2" />';
const ICON_AUDIT = '<path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />';

const auth = useAuthStore();
const router = useRouter();

const ALL_COMMANDS: (CommandItem & { adminOnly?: boolean })[] = [
  { label: 'Painel', hint: 'Visão geral do mês', name: 'admin-dashboard', iconInner: ICON_DASHBOARD },
  { label: 'Serviços', hint: 'Categorias e serviços do catálogo', name: 'admin-catalog', iconInner: ICON_CATALOG },
  { label: 'Agenda', hint: 'Calendário de atendimentos', name: 'admin-agenda', iconInner: ICON_AGENDA },
  { label: 'Financeiro', hint: 'Gastos, DRE e conciliação bancária', name: 'admin-finance', iconInner: ICON_FINANCE },
  { label: 'Estoque', hint: 'Itens e quantidades', name: 'admin-inventory', iconInner: ICON_INVENTORY },
  { label: 'Usuários', hint: 'Contas de acesso ao painel', name: 'admin-users', iconInner: ICON_USERS, adminOnly: true },
  { label: 'Auditoria', hint: 'Histórico de ações da equipe', name: 'admin-audit', iconInner: ICON_AUDIT, adminOnly: true },
];

const open = ref(false);
const query = ref('');
const activeIndex = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);
const panel = ref<HTMLElement | null>(null);

const availableCommands = computed(() => ALL_COMMANDS.filter((c) => !c.adminOnly || auth.user?.role === 'ADMIN'));
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return availableCommands.value;
  return availableCommands.value.filter((c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q));
});

watch(query, () => {
  activeIndex.value = 0;
});

async function openPalette() {
  open.value = true;
  query.value = '';
  activeIndex.value = 0;
  await nextTick();
  inputEl.value?.focus();
}

function closePalette() {
  open.value = false;
}

function selectCommand(cmd: CommandItem) {
  router.push({ name: cmd.name });
  closePalette();
}

// Ctrl+K (Windows/Linux) ou Cmd+K (Mac) global — funciona em qualquer aba do
// painel, não só com o botão de busca focado, já que o atalho é o ponto
// principal (o botão é só a pista visual de que ele existe).
function onKeydownGlobal(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (open.value) closePalette();
    else openPalette();
  }
}

function onKeydownPanel(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closePalette();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex.value = Math.min(activeIndex.value + 1, filtered.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const cmd = filtered.value[activeIndex.value];
    if (cmd) selectCommand(cmd);
  }
}

onMounted(() => document.addEventListener('keydown', onKeydownGlobal));
onUnmounted(() => document.removeEventListener('keydown', onKeydownGlobal));
</script>

<template>
  <button type="button" class="admin-cmdk-trigger" @click="openPalette">
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
    <span>Buscar…</span>
    <kbd>Ctrl K</kbd>
  </button>

  <Teleport to="#overlay-slot">
    <Transition name="admin-cmdk-fade">
      <div v-if="open" class="admin-cmdk-backdrop" @click.self="closePalette">
        <div ref="panel" class="admin-cmdk-panel" role="dialog" aria-modal="true" aria-label="Busca rápida" @keydown="onKeydownPanel">
          <div class="admin-cmdk-search">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input ref="inputEl" v-model="query" type="text" placeholder="Ir para uma aba do painel…" autocomplete="off" />
            <kbd>Esc</kbd>
          </div>

          <ul v-if="filtered.length" class="admin-cmdk-list">
            <li
              v-for="(cmd, i) in filtered"
              :key="cmd.name"
              class="admin-cmdk-item"
              :class="{ 'admin-cmdk-item--active': i === activeIndex }"
              @click="selectCommand(cmd)"
              @mouseenter="activeIndex = i"
            >
              <svg class="admin-cmdk-item__icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="cmd.iconInner" />
              <span class="admin-cmdk-item__text">
                <strong>{{ cmd.label }}</strong>
                <small>{{ cmd.hint }}</small>
              </span>
            </li>
          </ul>
          <p v-else class="admin-cmdk-empty">Nenhuma aba encontrada para "{{ query }}".</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.admin-cmdk-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-ink-soft);
  font-family: inherit;
  font-size: 0.85rem;
  padding: 8px 12px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard);
}

.admin-cmdk-trigger:hover {
  border-color: var(--color-rose-300);
  color: var(--color-rose-700);
}

.admin-cmdk-trigger kbd {
  font-family: inherit;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--color-ink-soft);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  padding: 2px 6px;
}

/* Só a partir de 1100px: o gatilho é um "bônus" de descoberta pro atalho de
   teclado, não a única forma de abrir a busca — não vale disputar espaço
   com o resto do topo (já cheio: estatísticas, conta, nav) em telas
   menores. O atalho Ctrl/Cmd+K continua funcionando em qualquer largura. */
@media (max-width: 1099px) {
  .admin-cmdk-trigger {
    display: none;
  }
}

.admin-cmdk-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: min(18vh, 140px);
  background: rgba(28, 18, 16, 0.35);
  backdrop-filter: blur(2px);
}

.admin-cmdk-panel {
  width: min(560px, calc(100vw - var(--space-5) * 2));
  max-height: min(420px, 70vh);
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.admin-cmdk-search {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-ink-soft);
  flex-shrink: 0;
}

.admin-cmdk-search input {
  flex: 1;
  border: none;
  outline: none;
  background: none;
  font-family: inherit;
  font-size: 1rem;
  color: var(--color-ink);
}

.admin-cmdk-search kbd {
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--color-ink-soft);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  padding: 3px 7px;
  flex-shrink: 0;
}

.admin-cmdk-list {
  list-style: none;
  margin: 0;
  padding: var(--space-2);
  overflow-y: auto;
}

.admin-cmdk-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 10px var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}

.admin-cmdk-item--active {
  background: var(--color-rose-100);
}

.admin-cmdk-item__icon {
  flex-shrink: 0;
  color: var(--color-rose-700);
}

.admin-cmdk-item__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.admin-cmdk-item__text strong {
  font-size: 0.92rem;
  color: var(--color-ink);
}

.admin-cmdk-item__text small {
  font-size: 0.78rem;
  color: var(--color-ink-muted);
}

.admin-cmdk-empty {
  padding: var(--space-6) var(--space-5);
  text-align: center;
  color: var(--color-ink-soft);
  font-size: 0.9rem;
}

.admin-cmdk-fade-enter-active,
.admin-cmdk-fade-leave-active {
  transition: opacity var(--duration-fast) var(--ease-standard);
}

.admin-cmdk-fade-enter-from,
.admin-cmdk-fade-leave-to {
  opacity: 0;
}

.admin-cmdk-fade-enter-active .admin-cmdk-panel {
  animation: admin-cmdk-panel-in 0.18s var(--ease-premium);
}

@keyframes admin-cmdk-panel-in {
  from {
    transform: translateY(-8px) scale(0.98);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .admin-cmdk-fade-enter-active,
  .admin-cmdk-fade-leave-active,
  .admin-cmdk-fade-enter-active .admin-cmdk-panel {
    transition: none;
    animation: none;
  }
}
</style>
