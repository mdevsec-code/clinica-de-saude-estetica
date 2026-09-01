import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import './lib/motion';
import { initSmoothScroll } from './composables/useSmoothScroll';
import './styles/global.css';

// Precisa rodar ANTES do app montar: o Vue monta componentes filhos antes do
// pai (App.vue), então se o ScrollSmoother só fosse criado no onMounted do
// App.vue, toda ScrollTrigger criada por uma view (ex.: o parallax do hero
// da Home) já teria sido registrada contra o scroll "cru" da janela. O
// #smooth-wrapper/#smooth-content já existem como HTML estático em
// index.html exatamente para permitir isso.
initSmoothScroll();

createApp(App).use(createPinia()).use(router).mount('#app');
