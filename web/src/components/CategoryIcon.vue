<script setup lang="ts">
const props = defineProps<{ slug: string }>();

const icons: Record<string, string> = {
  'harmonizacao-facial':
    'M12 3.5C8.5 3.5 6 7 6 11.5S8.5 21 12 21 18 17.5 18 11.5 15.5 3.5 12 3.5Z M12 6v11 M9 11h.01 M15 11h.01',
  'harmonizacao-corporal':
    'M9 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z M6 21v-6.5a3 3 0 0 1 3-3h0a3 3 0 0 1 3 3V21 M15 8c1.8 0 3 1.6 3 3.5S16.8 15 15 15 M15 15c1.8 0 3 1.6 3 3.5',
  sobrancelha:
    'M4 15c2.5-6 6-8 9-8s5.5 2.5 7 5M6 16.5c2-1.5 4.5-2 7-1.2',
  'limpeza-de-pele':
    'M12 3c3 4 5 7 5 10a5 5 0 1 1-10 0c0-3 2-6 5-10Z',
  depilacao:
    'M4 12h3M9 12h2M14 12l2-2M14 12l2 2M18 8l2 8M18 16l2-8',
  'massagens-terapias-corporais':
    'M6 13c0-3 2.5-5 6-5s6 2 6 5-2 6-6 6-6-3-6-6Z M9 10.5c.6-.6 1.6-1 3-1',
  micropigmentacao:
    'M6 18 16 8a2.1 2.1 0 0 1 3 3L9 21H6v-3Z M14.5 9.5 16.5 11.5',
  nutricao:
    'M12 8.5c-3.5 0-6 2.7-6 6.3 0 3 2.2 5.7 4.6 5.7.9 0 1.4-.4 2-.4.6 0 1.1.4 2 .4 2.2 0 4.1-2.1 4.9-4.3M12 8.5c0-2.2 1.5-3.8 3.5-4.2M12 8.5c-.5-1.6-1.8-2.7-3.5-3',
};

const fallback = 'M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2';
</script>

<template>
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="icons[props.slug] ?? fallback" />
  </svg>
</template>
