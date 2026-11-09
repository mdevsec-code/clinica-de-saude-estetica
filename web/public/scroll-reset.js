// Carregado por <script src> clássico (síncrono) no <head> de index.html —
// roda ANTES do navegador sequer começar a desenhar a página. A mesma linha
// dentro de main.ts (um <script type="module">, que só executa depois do
// HTML inteiro já ter sido processado) chegava tarde demais: o navegador já
// tinha restaurado sozinho a posição de scroll da visita anterior antes
// desse módulo rodar. Arquivo próprio (não inline) para a Content-Security-
// Policy do site poder proibir script inline (ver deploy/hostinger/nginx.conf).
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
// Alguns navegadores preservam a posição de rolagem de antes do reload por
// conta própria, à parte da History API acima — sem isto, essa posição
// antiga (ex.: perto do rodapé) fica visível por um instante ao recarregar,
// antes da cortina de abertura (AppIntroLoader.vue) revelar a página.
window.scrollTo(0, 0);
