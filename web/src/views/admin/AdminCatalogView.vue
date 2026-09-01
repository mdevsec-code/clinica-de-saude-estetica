<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError } from '@/services/api';
import {
  createCategory,
  createService,
  fetchAdminCategories,
  updateCategory,
  updateService,
} from '@/services/admin-catalog.service';
import type { AdminCategory, AdminService } from '@/types';
import LoadingState from '@/components/LoadingState.vue';
import EmptyState from '@/components/EmptyState.vue';

const router = useRouter();
const categories = ref<AdminCategory[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const { categories: data } = await fetchAdminCategories();
    categories.value = data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      router.push({ name: 'admin-login' });
      return;
    }
    error.value = 'Não foi possível carregar o catálogo. Tente novamente.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function formatPrice(cents: number | null) {
  if (cents == null) return 'Consulte';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Converte "50", "50,00" ou "50.00" (o que a pessoa digitar) em centavos —
// texto vazio vira null (preço "sob consulta"), nunca 0 por engano.
function parsePriceToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

function priceToInputValue(cents: number | null) {
  return cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

// --- Nova categoria ---
const newCategory = reactive({ name: '', imageUrl: '', featured: false });
const creatingCategory = ref(false);
const newCategoryError = ref<string | null>(null);

async function submitNewCategory() {
  if (!newCategory.name.trim()) return;
  creatingCategory.value = true;
  newCategoryError.value = null;
  try {
    const { category } = await createCategory({
      name: newCategory.name.trim(),
      imageUrl: newCategory.imageUrl.trim() || null,
      featured: newCategory.featured,
    });
    categories.value.push({ ...category, services: [] });
    newCategory.name = '';
    newCategory.imageUrl = '';
    newCategory.featured = false;
  } catch (err) {
    newCategoryError.value = err instanceof ApiError ? err.message : 'Não foi possível criar a categoria.';
  } finally {
    creatingCategory.value = false;
  }
}

// --- Editar categoria ---
const editingCategoryId = ref<string | null>(null);
const editCategoryForm = reactive({ name: '', imageUrl: '' });

function startEditCategory(category: AdminCategory) {
  editingCategoryId.value = category.id;
  editCategoryForm.name = category.name;
  editCategoryForm.imageUrl = category.imageUrl ?? '';
}

function cancelEditCategory() {
  editingCategoryId.value = null;
}

async function saveEditCategory(category: AdminCategory) {
  const name = editCategoryForm.name.trim();
  if (!name) return;
  try {
    const { category: updated } = await updateCategory(category.id, {
      name,
      imageUrl: editCategoryForm.imageUrl.trim() || null,
    });
    category.name = updated.name;
    category.imageUrl = updated.imageUrl;
    editingCategoryId.value = null;
  } catch {
    // Mantém o formulário aberto para tentar de novo — a mensagem de erro
    // específica não é crítica aqui, o estado "ainda em edição" já comunica
    // que não salvou.
  }
}

async function toggleCategoryActive(category: AdminCategory) {
  const next = !category.active;
  category.active = next; // otimista: painel interno, latência já é baixa
  try {
    await updateCategory(category.id, { active: next });
  } catch {
    category.active = !next;
  }
}

// O destaque é conceitualmente único (a Home mostra só o primeiro
// category.featured encontrado) — marcar um desmarca qualquer outro, para o
// estado no banco nunca ficar ambíguo sobre qual é o destaque atual.
async function setFeatured(category: AdminCategory) {
  const previouslyFeatured = categories.value.filter((c) => c.featured && c.id !== category.id);
  category.featured = true;
  previouslyFeatured.forEach((c) => (c.featured = false));
  try {
    await updateCategory(category.id, { featured: true });
    await Promise.all(previouslyFeatured.map((c) => updateCategory(c.id, { featured: false })));
  } catch {
    await load();
  }
}

// --- Novo serviço ---
const openNewServiceFor = ref<string | null>(null);
const newService = reactive({ name: '', durationMinutes: 30, priceInput: '', description: '' });
const creatingService = ref(false);
const newServiceError = ref<string | null>(null);

function openServiceForm(categoryId: string) {
  openNewServiceFor.value = categoryId;
  newService.name = '';
  newService.durationMinutes = 30;
  newService.priceInput = '';
  newService.description = '';
  newServiceError.value = null;
}

async function submitNewService(category: AdminCategory) {
  if (!newService.name.trim() || newService.durationMinutes < 5) return;
  creatingService.value = true;
  newServiceError.value = null;
  try {
    const { service } = await createService(category.id, {
      name: newService.name.trim(),
      durationMinutes: newService.durationMinutes,
      priceCents: parsePriceToCents(newService.priceInput),
      description: newService.description.trim() || null,
    });
    category.services.push(service);
    openNewServiceFor.value = null;
  } catch (err) {
    newServiceError.value = err instanceof ApiError ? err.message : 'Não foi possível criar o serviço.';
  } finally {
    creatingService.value = false;
  }
}

// --- Editar serviço ---
const editingServiceId = ref<string | null>(null);
const editServiceForm = reactive({ name: '', durationMinutes: 30, priceInput: '', description: '' });

function startEditService(service: AdminService) {
  editingServiceId.value = service.id;
  editServiceForm.name = service.name;
  editServiceForm.durationMinutes = service.durationMinutes;
  editServiceForm.priceInput = priceToInputValue(service.priceCents);
  editServiceForm.description = service.description ?? '';
}

function cancelEditService() {
  editingServiceId.value = null;
}

async function saveEditService(service: AdminService) {
  const name = editServiceForm.name.trim();
  if (!name || editServiceForm.durationMinutes < 5) return;
  try {
    const { service: updated } = await updateService(service.id, {
      name,
      durationMinutes: editServiceForm.durationMinutes,
      priceCents: parsePriceToCents(editServiceForm.priceInput),
      description: editServiceForm.description.trim() || null,
    });
    Object.assign(service, updated);
    editingServiceId.value = null;
  } catch {
    // formulário permanece aberto para nova tentativa
  }
}

async function toggleServiceActive(service: AdminService) {
  const next = !service.active;
  service.active = next;
  try {
    await updateService(service.id, { active: next });
  } catch {
    service.active = !next;
  }
}
</script>

<template>
  <div class="admin-catalog">
    <div class="admin-catalog__header">
      <div class="admin-catalog__title">
        <span class="admin-page-icon">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 12.5 12.5 20.5a2 2 0 0 1-2.83 0l-6.17-6.17a2 2 0 0 1 0-2.83L11.5 3.5H19a1.5 1.5 0 0 1 1.5 1.5Z" /><circle cx="15.5" cy="8.5" r="1.25" fill="currentColor" stroke="none" /></svg>
        </span>
        <div>
          <h1>Serviços e categorias</h1>
          <p>Cadastre aqui o que aparece no site público e no agendamento.</p>
        </div>
      </div>
      <div v-if="categories.length" class="admin-catalog__stats">
        <div class="admin-catalog__stat">
          <strong>{{ categories.length }}</strong>
          <span>categorias</span>
        </div>
        <div class="admin-catalog__stat">
          <strong>{{ categories.reduce((sum, c) => sum + c.services.length, 0) }}</strong>
          <span>serviços</span>
        </div>
      </div>
    </div>

    <Transition name="fade-swap" mode="out-in">
    <LoadingState v-if="loading" key="loading" label="Carregando catálogo…" />
    <EmptyState v-else-if="error" key="error" title="Algo deu errado" :description="error" action-label="Tentar novamente" @action="load" />

    <div v-else key="content">
      <form class="admin-card admin-catalog__new-category" @submit.prevent="submitNewCategory">
        <h2>
          <span class="admin-card__icon">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </span>
          Nova categoria
        </h2>
        <div class="admin-form-row">
          <label class="admin-field">
            Nome
            <input v-model="newCategory.name" type="text" placeholder="Ex.: Sobrancelha" required />
          </label>
          <label class="admin-field">
            URL da imagem (opcional)
            <input v-model="newCategory.imageUrl" type="text" placeholder="/services/exemplo.jpg" />
          </label>
          <label class="admin-toggle">
            <input v-model="newCategory.featured" type="checkbox" />
            <span class="admin-toggle__track"><span class="admin-toggle__thumb" /></span>
            Destaque na home
          </label>
          <button type="submit" class="button button--primary" :disabled="creatingCategory">
            {{ creatingCategory ? 'Criando…' : 'Criar categoria' }}
          </button>
        </div>
        <p v-if="newCategoryError" class="admin-error">{{ newCategoryError }}</p>
      </form>

      <EmptyState v-if="!categories.length" title="Nenhuma categoria cadastrada ainda." />

      <div v-for="category in categories" :key="category.id" class="admin-card admin-category" :class="{ 'admin-category--inactive': !category.active }">
        <div class="admin-category__header">
          <div v-if="editingCategoryId === category.id" class="admin-form-row admin-category__edit-row">
            <input v-model="editCategoryForm.name" type="text" class="admin-inline-input" placeholder="Nome" />
            <input v-model="editCategoryForm.imageUrl" type="text" class="admin-inline-input" placeholder="URL da imagem" />
            <button type="button" class="admin-chip-btn admin-chip-btn--primary" @click="saveEditCategory(category)">Salvar</button>
            <button type="button" class="admin-chip-btn" @click="cancelEditCategory">Cancelar</button>
          </div>
          <div v-else class="admin-category__title">
            <span class="admin-category__thumb">
              <img v-if="category.imageUrl" :src="category.imageUrl" alt="" />
              <span v-else class="admin-category__thumb-fallback">{{ category.name.charAt(0) }}</span>
            </span>
            <div class="admin-category__title-text">
              <div class="admin-category__name-row">
                <h2>{{ category.name }}</h2>
                <span v-if="category.featured" class="admin-badge admin-badge--featured">★ Destaque</span>
                <span v-if="!category.active" class="admin-badge admin-badge--muted">Inativa</span>
              </div>
              <span class="admin-category__count">
                {{ category.services.length }} {{ category.services.length === 1 ? 'serviço' : 'serviços' }} ·
                {{ category.services.filter((s) => s.active).length }} ativos
              </span>
            </div>
          </div>

          <div class="admin-category__actions">
            <button type="button" class="admin-icon-btn" title="Editar categoria" aria-label="Editar categoria" @click="startEditCategory(category)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </button>
            <button v-if="!category.featured" type="button" class="admin-icon-btn" title="Definir como destaque" aria-label="Definir como destaque" @click="setFeatured(category)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.6 5.9 6.4.6-4.8 4.3 1.4 6.2L12 16.9 6.4 20l1.4-6.2-4.8-4.3 6.4-.6Z" /></svg>
            </button>
            <button type="button" class="admin-icon-btn" :class="{ 'admin-icon-btn--danger': category.active }" :title="category.active ? 'Desativar categoria' : 'Reativar categoria'" :aria-label="category.active ? 'Desativar categoria' : 'Reativar categoria'" @click="toggleCategoryActive(category)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v10" /><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /></svg>
            </button>
          </div>
        </div>

        <ul v-if="category.services.length" class="admin-service-grid">
          <li v-for="service in category.services" :key="service.id" class="admin-service" :class="{ 'admin-service--inactive': !service.active }">
            <template v-if="editingServiceId === service.id">
              <div class="admin-service__edit">
                <label class="admin-field">
                  Nome
                  <input v-model="editServiceForm.name" type="text" />
                </label>
                <label class="admin-field admin-field--small">
                  Duração (min)
                  <input v-model.number="editServiceForm.durationMinutes" type="number" min="5" step="5" />
                </label>
                <label class="admin-field admin-field--small">
                  Preço (R$)
                  <input v-model="editServiceForm.priceInput" type="text" placeholder="Sob consulta" />
                </label>
                <label class="admin-field admin-field--wide">
                  Descrição (opcional)
                  <input v-model="editServiceForm.description" type="text" />
                </label>
                <div class="admin-form-row">
                  <button type="button" class="admin-chip-btn admin-chip-btn--primary" @click="saveEditService(service)">Salvar</button>
                  <button type="button" class="admin-chip-btn" @click="cancelEditService">Cancelar</button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="admin-service__icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 3 7l9 5 9-5-9-5Z" /><path d="M3 12l9 5 9-5" /></svg>
              </div>
              <div class="admin-service__info">
                <span class="admin-service__name-row">
                  <span class="admin-service__name">{{ service.name }}</span>
                  <span v-if="!service.active" class="admin-badge admin-badge--muted">Inativo</span>
                </span>
                <span v-if="service.description" class="admin-service__description">{{ service.description }}</span>
                <span class="admin-service__meta">
                  <span class="admin-service__meta-pill">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                    {{ service.durationMinutes }} min
                  </span>
                  <span class="admin-service__price">{{ formatPrice(service.priceCents) }}</span>
                </span>
              </div>
              <div class="admin-service__actions">
                <button type="button" class="admin-icon-btn admin-icon-btn--sm" title="Editar serviço" aria-label="Editar serviço" @click="startEditService(service)">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
                <button type="button" class="admin-icon-btn admin-icon-btn--sm" :class="{ 'admin-icon-btn--danger': service.active }" :title="service.active ? 'Desativar serviço' : 'Reativar serviço'" :aria-label="service.active ? 'Desativar serviço' : 'Reativar serviço'" @click="toggleServiceActive(service)">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v10" /><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /></svg>
                </button>
              </div>
            </template>
          </li>
        </ul>
        <p v-else class="admin-empty-hint">Nenhum serviço nesta categoria ainda.</p>

        <form v-if="openNewServiceFor === category.id" class="admin-new-service-form" @submit.prevent="submitNewService(category)">
          <div class="admin-form-row">
            <label class="admin-field">
              Nome do serviço
              <input v-model="newService.name" type="text" required />
            </label>
            <label class="admin-field admin-field--small">
              Duração (min)
              <input v-model.number="newService.durationMinutes" type="number" min="5" step="5" required />
            </label>
            <label class="admin-field admin-field--small">
              Preço (R$)
              <input v-model="newService.priceInput" type="text" placeholder="Sob consulta" />
            </label>
          </div>
          <label class="admin-field">
            Descrição (opcional)
            <input v-model="newService.description" type="text" />
          </label>
          <p v-if="newServiceError" class="admin-error">{{ newServiceError }}</p>
          <div class="admin-form-row">
            <button type="submit" class="button button--primary" :disabled="creatingService">
              {{ creatingService ? 'Salvando…' : 'Salvar serviço' }}
            </button>
            <button type="button" class="admin-chip-btn" @click="openNewServiceFor = null">Cancelar</button>
          </div>
        </form>
        <button v-else type="button" class="admin-catalog__add-service" @click="openServiceForm(category.id)">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Novo serviço
        </button>
      </div>
    </div>
    </Transition>
  </div>
</template>

<style scoped>
.admin-catalog__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.admin-catalog__title {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.admin-catalog__header p {
  color: var(--color-ink-muted);
}

.admin-catalog__stats {
  display: flex;
  gap: var(--space-5);
}

.admin-catalog__stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.2;
}

.admin-catalog__stat strong {
  font-family: var(--font-display);
  font-size: 1.5rem;
  color: var(--color-rose-900);
}

.admin-catalog__stat span {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-ink-soft);
}

.admin-card {
  position: relative;
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  margin-bottom: var(--space-5);
  transition: transform var(--duration-base) var(--ease-premium), box-shadow var(--duration-base) var(--ease-premium), border-color var(--duration-base) var(--ease-premium);
}

.admin-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--color-rose-700), var(--color-gold-500));
  opacity: 0;
  transition: opacity var(--duration-base) var(--ease-premium);
}

.admin-card:hover {
  border-color: var(--color-rose-300);
}

.admin-card:hover::before {
  opacity: 1;
}

.admin-catalog__new-category h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.1rem;
  margin-bottom: var(--space-3);
}

.admin-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  background: var(--color-rose-100);
  color: var(--color-rose-700);
  flex-shrink: 0;
}

.admin-form-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-3);
}

.admin-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-ink);
  flex: 1;
  min-width: 140px;
}

.admin-field--small {
  flex: 0 0 120px;
  min-width: 100px;
}

.admin-field--wide {
  flex-basis: 100%;
}

.admin-field input,
.admin-inline-input {
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 400;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}

.admin-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-ink);
  cursor: pointer;
  padding-bottom: 10px;
}

.admin-toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.admin-toggle__track {
  position: relative;
  flex-shrink: 0;
  width: 34px;
  height: 20px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  transition: background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
}

.admin-toggle__thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: var(--shadow-sm);
  transition: transform var(--duration-fast) var(--ease-premium);
}

.admin-toggle input:checked + .admin-toggle__track {
  background: var(--color-rose-700);
  border-color: var(--color-rose-700);
}

.admin-toggle input:checked + .admin-toggle__track .admin-toggle__thumb {
  transform: translateX(14px);
}

.admin-toggle input:focus-visible + .admin-toggle__track {
  box-shadow: 0 0 0 3px var(--color-rose-100);
}

.admin-error {
  color: var(--color-danger);
  font-size: 0.85rem;
  margin-top: var(--space-2);
}

.admin-category--inactive {
  opacity: 0.65;
}

.admin-category__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.admin-category__title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.admin-category__thumb {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  overflow: hidden;
  flex-shrink: 0;
  background: linear-gradient(135deg, var(--color-rose-100), var(--color-rose-300));
  display: flex;
  align-items: center;
  justify-content: center;
}

.admin-category__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.admin-category__thumb-fallback {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--color-rose-900);
}

.admin-category__title-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.admin-category__name-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.admin-category__title h2 {
  font-size: 1.2rem;
}

.admin-category__count {
  font-size: 0.8rem;
  color: var(--color-ink-soft);
}

.admin-category__edit-row {
  width: 100%;
}

.admin-category__actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}

.admin-badge {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
}

.admin-badge--featured {
  background: var(--color-rose-100);
  color: var(--color-rose-700);
}

.admin-badge--muted {
  background: var(--color-surface-muted);
  color: var(--color-ink-soft);
}

.admin-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-rose-700);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard);
}

.admin-icon-btn:hover {
  border-color: var(--color-rose-500);
  background: var(--color-rose-100);
  transform: translateY(-1px);
}

.admin-icon-btn--sm {
  width: 28px;
  height: 28px;
}

.admin-icon-btn--danger {
  color: var(--color-danger);
}

.admin-icon-btn--danger:hover {
  border-color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
}

.admin-chip-btn {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  color: var(--color-ink-muted);
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  padding: 7px 16px;
  transition: border-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard);
}

.admin-chip-btn:hover {
  border-color: var(--color-rose-500);
  color: var(--color-rose-700);
}

.admin-chip-btn--primary {
  background: var(--color-rose-700);
  border-color: var(--color-rose-700);
  color: #fff;
}

.admin-chip-btn--primary:hover {
  background: var(--color-rose-900);
  border-color: var(--color-rose-900);
  color: #fff;
}

.admin-service-grid {
  list-style: none;
  margin: 0 0 var(--space-4);
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-3);
}

.admin-service {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  transition: border-color var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.admin-service:hover {
  border-color: var(--color-rose-300);
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.admin-service--inactive {
  opacity: 0.6;
}

.admin-service__icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--color-rose-100);
  color: var(--color-rose-700);
  display: flex;
  align-items: center;
  justify-content: center;
}

.admin-service__info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.admin-service__name-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.admin-service__name {
  font-weight: 700;
  color: var(--color-ink);
}

.admin-service__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: 2px;
}

.admin-service__meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-ink-soft);
  background: var(--color-surface-muted);
  border-radius: var(--radius-pill);
  padding: 2px 8px;
}

.admin-service__price {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-rose-700);
}

.admin-service__description {
  font-size: 0.82rem;
  color: var(--color-ink-muted);
}

.admin-service__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.admin-service__edit {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  width: 100%;
}

.admin-empty-hint {
  color: var(--color-ink-soft);
  font-size: 0.9rem;
  margin-bottom: var(--space-4);
}

.admin-new-service-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-bg);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
}

.admin-catalog__add-service {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px dashed var(--color-rose-300);
  border-radius: var(--radius-sm);
  color: var(--color-rose-700);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 8px 14px;
  transition: border-color var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard);
}

.admin-catalog__add-service:hover {
  border-color: var(--color-rose-500);
  background: var(--color-rose-100);
}
</style>
