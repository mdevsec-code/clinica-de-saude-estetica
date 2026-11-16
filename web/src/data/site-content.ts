// Textos e fotos do site público que a clínica edita em Painel → Site.
// Aqui ficam o texto/foto padrão de cada campo (o que o site mostra enquanto
// ninguém editou, e o que volta com "Voltar ao padrão") e como cada campo
// aparece no painel. As chaves precisam bater com a lista do servidor
// (server/src/modules/site-content/site-content.routes.ts).

export interface SiteField {
  key: string;
  label: string;
  // toggle: liga/desliga uma seção ('sim' / 'não').
  kind: 'text' | 'textarea' | 'image' | 'toggle';
  default: string;
  hint?: string;
}

export interface SiteSection {
  id: string;
  title: string;
  // Onde aparece, em uma frase, para quem edita.
  description: string;
  page: string; // página do site onde a seção está
  anchor?: string; // parte da página (seletor) para a pré-visualização rolar até ela
  fields: SiteField[];
}

export const SITE_SECTIONS: SiteSection[] = [
  {
    id: 'hero',
    title: 'Início — topo',
    description: 'A primeira coisa que a cliente vê ao abrir o site: título grande, texto, botões e a foto principal.',
    page: '/',
    anchor: '.hero',
    fields: [
      { key: 'home.heroTitle', label: 'Título principal', kind: 'text', default: 'Estética e Micropigmentação', hint: 'Curto: até umas 4 palavras fica melhor.' },
      {
        key: 'home.heroLead',
        label: 'Texto abaixo do título',
        kind: 'textarea',
        default: 'Clínica de Saúde Estética Noely Cerqueira, em Camaçari (BA): cuidado personalizado, com técnica e atenção a cada detalhe.',
        hint: 'Uma ou duas frases dizendo o que a clínica faz e onde fica.',
      },
      { key: 'home.primaryCta', label: 'Botão principal', kind: 'text', default: 'Agendar atendimento', hint: 'Leva para a página de agendamento.' },
      { key: 'home.secondaryCta', label: 'Segundo botão', kind: 'text', default: 'Ver procedimentos', hint: 'Leva para a lista de serviços.' },
      { key: 'home.fact2Title', label: 'Destaque 2 — palavra grande', kind: 'text', default: 'Online', hint: 'O destaque 1 é sempre o número de especialidades.' },
      { key: 'home.fact2Text', label: 'Destaque 2 — texto pequeno', kind: 'text', default: 'agendamento a qualquer hora' },
      { key: 'home.fact3Title', label: 'Destaque 3 — palavra grande', kind: 'text', default: 'Camaçari' },
      { key: 'home.fact3Text', label: 'Destaque 3 — texto pequeno', kind: 'text', default: 'Bahia' },
      { key: 'home.heroPhoto', label: 'Foto principal', kind: 'image', default: '/brand/noely-cerqueira-foto.jpeg', hint: 'Foto em pé (retrato) fica melhor.' },
      { key: 'home.heroCaption', label: 'Legenda da foto', kind: 'text', default: 'Noely Cerqueira, especialista em estética' },
    ],
  },
  {
    id: 'featured',
    title: 'Início — procedimento em destaque',
    description: 'Faixa rosada logo abaixo do topo, com a foto e o nome da especialidade marcada como "Destaque" em Serviços.',
    page: '/',
    anchor: '.featured',
    fields: [
      {
        key: 'home.featuredText',
        label: 'Texto do destaque',
        kind: 'textarea',
        default:
          'O procedimento mais procurado da clínica: planejamento personalizado e técnica refinada para realçar a sua beleza natural com equilíbrio, do primeiro atendimento ao resultado.',
        hint: 'A foto e o nome mudam em Painel → Serviços (estrela "Destaque").',
      },
      { key: 'home.featuredCta', label: 'Texto do botão', kind: 'text', default: 'Agendar harmonização' },
    ],
  },
  {
    id: 'about',
    title: 'Início — sobre a clínica',
    description: 'Faixa escura com a foto da Noely e uma frase sobre a clínica.',
    page: '/',
    anchor: '.about',
    fields: [
      { key: 'home.aboutTitle', label: 'Título', kind: 'text', default: 'Sobre a clínica' },
      {
        key: 'home.aboutText',
        label: 'Frase',
        kind: 'textarea',
        default: 'Estética e micropigmentação, da sobrancelha às massagens terapêuticas, com atendimento próximo, técnico e feito para você.',
      },
      { key: 'home.aboutPhoto', label: 'Foto', kind: 'image', default: '/brand/noely-consultorio.jpg', hint: 'Foto em pé (retrato) fica melhor.' },
    ],
  },
  {
    id: 'specialties',
    title: 'Início — especialidades e faixa',
    description: 'Os cartões com foto de cada especialidade e a faixa de palavras que corre de lado logo depois.',
    page: '/',
    anchor: '.specialties-section',
    fields: [
      {
        key: 'home.specialtiesLead',
        label: 'Texto ao lado de "Especialidades"',
        kind: 'textarea',
        default: 'Um procedimento para cada etapa do seu cuidado, da limpeza de pele à micropigmentação.',
        hint: 'As fotos e os nomes dos cartões mudam em Painel → Serviços.',
      },
      {
        key: 'home.marquee',
        label: 'Palavras da faixa que corre',
        kind: 'textarea',
        default: 'Estética\nMicropigmentação\nAgendamento online\nCamaçari, Bahia',
        hint: 'Uma por linha.',
      },
    ],
  },
  {
    id: 'results',
    title: 'Início — resultados',
    description: 'Fotos de antes e depois e vídeos de procedimentos de clientes reais.',
    page: '/',
    anchor: '.results',
    fields: [
      { key: 'home.showResults', label: 'Mostrar esta seção', kind: 'toggle', default: 'sim' },
      { key: 'home.resultsTitle', label: 'Título', kind: 'text', default: 'Resultados' },
      { key: 'home.resultsLead', label: 'Texto', kind: 'textarea', default: 'Clientes reais da clínica, antes e depois e durante o procedimento.' },
    ],
  },
  {
    id: 'steps',
    title: 'Início — como funciona',
    description: 'Os 3 passos do agendamento online.',
    page: '/',
    anchor: '.steps',
    fields: [
      { key: 'home.showSteps', label: 'Mostrar esta seção', kind: 'toggle', default: 'sim' },
      { key: 'home.step1Title', label: 'Passo 1 — título', kind: 'text', default: 'Escolha o serviço' },
      { key: 'home.step1Text', label: 'Passo 1 — texto', kind: 'textarea', default: 'Navegue pelas especialidades e encontre o procedimento ideal para você.' },
      { key: 'home.step2Title', label: 'Passo 2 — título', kind: 'text', default: 'Escolha o dia e o horário' },
      { key: 'home.step2Text', label: 'Passo 2 — texto', kind: 'textarea', default: 'Veja a agenda real da clínica e selecione o horário que encaixa na sua rotina.' },
      { key: 'home.step3Title', label: 'Passo 3 — título', kind: 'text', default: 'Confirme e pronto' },
      { key: 'home.step3Text', label: 'Passo 3 — texto', kind: 'textarea', default: 'Informe seus dados e receba a confirmação do horário pelo WhatsApp.' },
    ],
  },
  {
    id: 'values',
    title: 'Início — por que a Noely',
    description: 'Três motivos para escolher a clínica.',
    page: '/',
    anchor: '.values',
    fields: [
      { key: 'home.showValues', label: 'Mostrar esta seção', kind: 'toggle', default: 'sim' },
      { key: 'home.why1Title', label: 'Motivo 1 — título', kind: 'text', default: 'Atendimento individual' },
      { key: 'home.why1Text', label: 'Motivo 1 — texto', kind: 'textarea', default: 'Cada procedimento pensado para a sua pele, o seu tempo e o seu conforto.' },
      { key: 'home.why2Title', label: 'Motivo 2 — título', kind: 'text', default: 'Ambiente acolhedor' },
      { key: 'home.why2Text', label: 'Motivo 2 — texto', kind: 'textarea', default: 'Um espaço tranquilo, pensado do início ao fim para o seu bem-estar.' },
      { key: 'home.why3Title', label: 'Motivo 3 — título', kind: 'text', default: 'Agendamento simples' },
      { key: 'home.why3Text', label: 'Motivo 3 — texto', kind: 'textarea', default: 'Escolha o serviço, a data e o horário em poucos toques, direto do celular.' },
    ],
  },
  {
    id: 'closing',
    title: 'Início — Instagram e chamada final',
    description: 'O cartão do Instagram e a frase grande no fim da página.',
    page: '/',
    anchor: '.instagram',
    fields: [
      { key: 'home.showInstagram', label: 'Mostrar o cartão do Instagram', kind: 'toggle', default: 'sim' },
      { key: 'home.instagramText', label: 'Texto do Instagram', kind: 'text', default: 'Procedimentos, resultados e bastidores da clínica no Instagram.' },
      { key: 'home.ctaTitle', label: 'Chamada do final da página', kind: 'text', default: 'Vamos agendar seu horário?' },
    ],
  },
  {
    id: 'services',
    title: 'Página Serviços',
    description: 'O topo da página com a lista de procedimentos e preços.',
    page: '/servicos',
    fields: [
      { key: 'services.title', label: 'Título', kind: 'text', default: 'Nossos serviços' },
      {
        key: 'services.description',
        label: 'Texto',
        kind: 'textarea',
        default: 'Os procedimentos da clínica, com duração e valor. Escolha um e siga direto para o agendamento.',
      },
      { key: 'services.image', label: 'Foto do topo', kind: 'image', default: '/brand/noely-servicos.jpg', hint: 'Foto deitada (paisagem) fica melhor.' },
    ],
  },
  {
    id: 'booking',
    title: 'Página Agendar',
    description: 'O topo da página onde a cliente marca o horário.',
    page: '/agendar',
    fields: [
      { key: 'booking.title', label: 'Título', kind: 'text', default: 'Agende seu horário' },
      { key: 'booking.description', label: 'Texto', kind: 'textarea', default: 'Escolha o procedimento, o dia e o horário. A confirmação chega pelo WhatsApp.' },
      { key: 'booking.image', label: 'Foto do topo', kind: 'image', default: '/brand/noely-agendar.jpg', hint: 'Foto deitada (paisagem) fica melhor.' },
    ],
  },
  {
    id: 'contact',
    title: 'Página Contato',
    description: 'O topo da página de contato.',
    page: '/contato',
    fields: [
      { key: 'contact.title', label: 'Título', kind: 'text', default: 'Fale conosco' },
      { key: 'contact.description', label: 'Texto', kind: 'textarea', default: 'WhatsApp, Instagram, endereço e horários da clínica em Camaçari (BA).' },
      { key: 'contact.image', label: 'Foto do topo', kind: 'image', default: '/brand/noely-contato.jpg', hint: 'Foto deitada (paisagem) fica melhor.' },
    ],
  },
  {
    id: 'tv',
    title: 'TV da recepção',
    description: 'A apresentação que passa na TV (noelycerqueira.com.br/tv).',
    page: '/tv',
    fields: [
      {
        key: 'tv.playlist',
        label: 'Música da TV (link do YouTube)',
        kind: 'text',
        default: '',
        hint: 'Cole o link de uma playlist (toca a playlist inteira) ou de uma música (toca uma rádio do YouTube a partir dela, passando para músicas parecidas). Em branco: TV sem música.',
      },
    ],
  },
];

export const SITE_DEFAULTS: Record<string, string> = Object.fromEntries(
  SITE_SECTIONS.flatMap((s) => s.fields.map((f) => [f.key, f.default])),
);
