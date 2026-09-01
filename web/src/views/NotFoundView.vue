<script setup lang="ts"></script>

<template>
  <div class="container not-found">
    <h1>Página não encontrada</h1>
    <p>O endereço que você acessou não existe.</p>
    <RouterLink to="/" class="button button--primary not-found__button">Voltar para o início</RouterLink>
  </div>
</template>

<style scoped>
.not-found {
  text-align: center;
  padding-block: var(--space-9);
}

.not-found__button {
  margin-top: var(--space-5);
}
</style>
