<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { FICHA_LEGAL_WARNING, groupFieldsBySection, isLongTextField, isYesNoField } from '@/data/ficha-templates';
import type { PatientDetail, PatientFicha } from '@/types';

// Modal de impressão de uma ficha JÁ PREENCHIDA (dados de um paciente
// específico) — de propósito SEM navegação: antes era uma rota separada que
// abria numa aba nova, tirando o admin do contexto do paciente só pra
// imprimir. O modelo EM BRANCO (pra imprimir e preencher à mão) não passa
// por aqui — é o PDF original de verdade, aberto direto (ver
// FICHA_BLANK_PDF em ficha-templates.ts e o botão 🖨️ ao lado de cada preset
// em AdminPatientDetailView.vue): os formulários da clínica não têm campo
// preenchível, então não dá pra sobrepor os dados registrados no PDF sem
// calibrar a posição de cada campo manualmente — por isso a ficha
// preenchida continua sendo esta tela em HTML, com os dados do sistema.
const props = defineProps<{
  patient: PatientDetail;
  type: string;
  ficha: PatientFicha;
}>();

const emit = defineEmits<{ close: [] }>();

const sections = computed(() => groupFieldsBySection(props.ficha.fields));
const legalWarning = computed(() => FICHA_LEGAL_WARNING[props.type]);

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function yesNoState(value: string): 'sim' | 'nao' | 'na' | null {
  const v = value.trim().toLowerCase();
  if (v === 'sim') return 'sim';
  if (v === 'não' || v === 'nao') return 'nao';
  if (v === 'n/a' || v === 'na') return 'na';
  return null;
}

function printFicha() {
  window.print();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => {
  document.body.classList.add('is-printing-ficha');
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  document.body.classList.remove('is-printing-ficha');
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div class="ficha-modal">
      <div class="ficha-modal__backdrop no-print" @click="emit('close')" />

      <div class="ficha-modal__toolbar no-print">
        <button type="button" class="ficha-modal__icon-btn" data-tooltip="Fechar (Esc)" @click="emit('close')">✕</button>
        <button type="button" class="button button--primary ficha-modal__print-btn" data-tooltip="Abrir a caixa de impressão do navegador" @click="printFicha">
          🖨️ Imprimir
        </button>
      </div>

      <div class="ficha-modal__scroll">
        <article class="ficha-sheet">
          <header class="ficha-sheet__header">
            <img src="/brand/logo-noely-cerqueira.png" alt="" class="ficha-sheet__logo" />
            <div>
              <strong>Clínica Noely Cerqueira</strong>
              <span>Estética e Micropigmentação · CNPJ 24.038.216/0001-04</span>
            </div>
          </header>

          <h1>{{ type }}</h1>
          <p class="ficha-sheet__confidential">
            Documento confidencial — contém dados pessoais e de saúde protegidos pela Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).
          </p>

          <div v-if="legalWarning" class="ficha-sheet__warning">⚠️ {{ legalWarning }}</div>

          <section class="ficha-sheet__patient">
            <div><span>Paciente</span><strong>{{ patient.name }}</strong></div>
            <div><span>Data de nascimento</span><strong>{{ formatDate(patient.birthDate) }}</strong></div>
            <div><span>WhatsApp / telefone</span><strong>{{ patient.whatsapp }}{{ patient.phone ? ' · ' + patient.phone : '' }}</strong></div>
            <div><span>Ficha registrada em</span><strong>{{ formatDate(ficha.createdAt) }}</strong></div>
          </section>

          <section v-for="(group, gi) in sections" :key="gi" class="ficha-sheet__section">
            <h2 v-if="group.section">{{ group.section }}</h2>

            <template v-for="field in group.items" :key="field.label">
              <div v-if="isYesNoField(field.label)" class="ficha-sheet__yesno">
                <span class="ficha-sheet__yesno-label">{{ field.label }}</span>
                <span class="ficha-sheet__yesno-options">
                  <span class="ficha-sheet__checkbox" :class="{ 'is-checked': yesNoState(field.value) === 'sim' }">☐ Sim</span>
                  <span class="ficha-sheet__checkbox" :class="{ 'is-checked': yesNoState(field.value) === 'nao' }">☐ Não</span>
                  <span class="ficha-sheet__checkbox" :class="{ 'is-checked': yesNoState(field.value) === 'na' }">☐ N/A</span>
                </span>
                <span v-if="!yesNoState(field.value) && field.value" class="ficha-sheet__yesno-details">{{ field.value }}</span>
              </div>

              <div v-else class="ficha-sheet__field" :class="{ 'is-long': isLongTextField(field.label) }">
                <dt>{{ field.label }}</dt>
                <dd>{{ field.value || '—' }}</dd>
              </div>
            </template>
          </section>

          <section v-if="ficha.notes" class="ficha-sheet__section">
            <h2>Observações</h2>
            <p class="ficha-sheet__notes">{{ ficha.notes }}</p>
          </section>

          <section class="ficha-sheet__section">
            <h2>Declaração e proteção de dados</h2>
            <p class="ficha-sheet__declaration">
              Declaro que as informações prestadas nesta ficha são verdadeiras e completas, de acordo com meu
              conhecimento no momento do preenchimento. Os dados de saúde aqui registrados são dados pessoais
              sensíveis (LGPD, art. 5º, II) e serão tratados pela Clínica Noely Cerqueira exclusivamente para
              finalidades relacionadas ao meu atendimento — avaliação, planejamento, execução e acompanhamento —
              incluindo o cumprimento de eventuais obrigações legais aplicáveis à documentação clínica. Fui
              informado(a) de que posso solicitar, a qualquer momento, esclarecimentos, acesso ou correção sobre
              os dados aqui registrados.
            </p>
          </section>

          <section class="ficha-sheet__signatures">
            <div>
              <div class="ficha-sheet__sign-line" />
              <span>Nome do(a) paciente / responsável legal</span>
              <span class="ficha-sheet__sign-hint">Data: ___ / ___ / ___ · Se responsável legal, indicar parentesco</span>
            </div>
            <div>
              <div class="ficha-sheet__sign-line" />
              <span>Profissional responsável</span>
              <span class="ficha-sheet__sign-hint">Registro profissional / função</span>
            </div>
          </section>
        </article>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ficha-modal {
  position: fixed;
  inset: 0;
  z-index: 500;
}

.ficha-modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(58, 44, 42, 0.55);
  backdrop-filter: blur(2px);
}

.ficha-modal__toolbar {
  position: fixed;
  top: var(--space-4);
  right: var(--space-4);
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.ficha-modal__icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: 1rem;
  cursor: pointer;
  box-shadow: var(--shadow-md);
  transition: transform var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard);
}

.ficha-modal__icon-btn:hover {
  background: var(--color-rose-100);
  transform: scale(1.06);
}

.ficha-modal__print-btn {
  box-shadow: var(--shadow-md);
}

.ficha-modal__scroll {
  position: relative;
  z-index: 1;
  height: 100%;
  overflow-y: auto;
  padding: 72px var(--space-4) var(--space-6);
}

.ficha-sheet {
  max-width: 820px;
  margin: 0 auto;
  background: var(--color-surface);
  color: var(--color-ink);
  padding: 48px;
  border-radius: var(--radius-md, 16px);
  box-shadow: var(--shadow-lg);
  font-size: 0.92rem;
  line-height: 1.5;
}

.ficha-sheet__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-bottom: var(--space-3);
  border-bottom: 2px solid var(--color-border);
  margin-bottom: var(--space-4);
}

.ficha-sheet__logo {
  height: 48px;
  width: auto;
}

.ficha-sheet__header div {
  display: flex;
  flex-direction: column;
  font-size: 0.78rem;
  color: var(--color-ink-muted);
}

.ficha-sheet__header strong {
  font-family: var(--font-display);
  font-size: 1.05rem;
  color: var(--color-rose-900);
}

.ficha-sheet h1 {
  font-family: var(--font-display);
  font-size: 1.5rem;
  color: var(--color-rose-900);
  margin: 0 0 4px;
}

.ficha-sheet__confidential {
  font-size: 0.78rem;
  font-style: italic;
  color: var(--color-ink-muted);
  margin: 0 0 var(--space-4);
}

.ficha-sheet__warning {
  background: #fdecea;
  border: 1px solid #f3b6ae;
  color: #7a2e24;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  margin-bottom: var(--space-4);
}

.ficha-sheet__patient {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px var(--space-4);
  padding: 14px 16px;
  background: var(--color-rose-100);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-5);
}

.ficha-sheet__patient div {
  display: flex;
  flex-direction: column;
  font-size: 0.82rem;
}

.ficha-sheet__patient span {
  color: var(--color-ink-muted);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ficha-sheet__patient strong {
  color: var(--color-rose-900);
}

.ficha-sheet__section {
  margin-bottom: var(--space-5);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.ficha-sheet__section:first-of-type {
  border-top: none;
  padding-top: 0;
}

.ficha-sheet__section h2 {
  font-family: var(--font-display);
  font-size: 0.95rem;
  color: var(--color-rose-700);
  margin: 0 0 var(--space-3);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-rose-300);
}

.ficha-sheet__field {
  display: grid;
  grid-template-columns: minmax(160px, 40%) 1fr;
  gap: 6px var(--space-4);
  padding: 6px 0;
}

.ficha-sheet__field dt {
  font-weight: 600;
  color: var(--color-ink);
}

.ficha-sheet__field dd {
  margin: 0;
  white-space: pre-wrap;
  align-self: end;
  border-bottom: 1px dotted var(--color-border);
  padding-bottom: 4px;
}

.ficha-sheet__field.is-long {
  grid-template-columns: 1fr;
}

.ficha-sheet__field.is-long dt {
  margin-bottom: 4px;
}

.ficha-sheet__field.is-long dd {
  min-height: 52px;
  border-bottom: 1px solid var(--color-border);
}

.ficha-sheet__yesno {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px var(--space-3);
  padding: 6px 0;
  border-bottom: 1px dotted var(--color-border);
}

.ficha-sheet__yesno-label {
  flex: 1 1 260px;
  font-weight: 500;
}

.ficha-sheet__yesno-options {
  display: flex;
  gap: var(--space-3);
  font-size: 0.85rem;
  color: var(--color-ink-muted);
  white-space: nowrap;
}

.ficha-sheet__checkbox.is-checked {
  color: var(--color-rose-700);
  font-weight: 700;
}

.ficha-sheet__yesno-details {
  flex-basis: 100%;
  font-size: 0.8rem;
  color: var(--color-ink-muted);
}

.ficha-sheet__notes,
.ficha-sheet__declaration {
  font-size: 0.8rem;
  color: var(--color-ink-muted);
  margin: 0;
  white-space: pre-wrap;
}

.ficha-sheet__signatures {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
  margin-top: 56px;
}

.ficha-sheet__sign-line {
  border-top: 1px solid var(--color-ink);
  margin-bottom: 6px;
}

.ficha-sheet__signatures span {
  display: block;
  font-size: 0.78rem;
}

.ficha-sheet__sign-hint {
  color: var(--color-ink-muted);
  font-size: 0.7rem;
}

@media print {
  .ficha-modal__backdrop,
  .ficha-modal__toolbar {
    display: none !important;
  }
  .ficha-modal {
    position: static;
  }
  .ficha-modal__scroll {
    height: auto;
    overflow: visible;
    padding: 0;
  }
  .ficha-sheet {
    box-shadow: none;
    border-radius: 0;
    max-width: none;
    padding: 0;
  }
}
</style>
