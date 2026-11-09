import type { vStagger } from './directives/stagger';

// Diretivas registradas globalmente em main.ts — declaradas aqui para o
// vue-tsc reconhecer `v-stagger` nos templates.
declare module 'vue' {
  interface GlobalDirectives {
    vStagger: typeof vStagger;
  }
}

export {};
