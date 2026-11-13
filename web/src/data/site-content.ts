// Textos e fotos do site público que a clínica edita em Painel → Site.
// Aqui ficam o texto/foto padrão de cada campo (o que o site mostra enquanto
// ninguém editou, e o que volta com "Voltar ao padrão") e como cada campo
// aparece no painel. As chaves precisam bater com a lista do servidor
// (server/src/modules/site-content/site-content.routes.ts).

export interface SiteField {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'image';
  default: string;
  hint?: string;
}

export interface SiteSection {
  title: string;
  page: string; // link para ver no site
  fields: SiteField[];
}

export const SITE_SECTIONS: SiteSection[] = [
  {
    title: 'Página inicial — topo',
    page: '/',
    fields: [
      { key: 'home.heroTitle', label: 'Título principal', kind: 'text', default: 'Estética e Micropigmentação' },
      {
        key: 'home.heroLead',
        label: 'Texto abaixo do título',
        kind: 'textarea',
        default: 'Clínica de Saúde Estética Noely Cerqueira, em Camaçari (BA): cuidado personalizado, com técnica e atenção a cada detalhe.',
      },
      { key: 'home.heroPhoto', label: 'Foto principal', kind: 'image', default: '/brand/noely-cerqueira-foto.jpeg', hint: 'Foto em pé (retrato) fica melhor.' },
      { key: 'home.heroCaption', label: 'Legenda da foto', kind: 'text', default: 'Noely Cerqueira, especialista em estética' },
    ],
  },
  {
    title: 'Página inicial — destaque e sobre',
    page: '/',
    fields: [
      {
        key: 'home.featuredText',
        label: 'Texto do procedimento em destaque',
        kind: 'textarea',
        default:
          'O procedimento mais procurado da clínica: planejamento personalizado e técnica refinada para realçar a sua beleza natural com equilíbrio, do primeiro atendimento ao resultado.',
        hint: 'A foto e o nome vêm da categoria marcada como "Destaque" em Serviços.',
      },
      { key: 'home.aboutTitle', label: 'Título do "Sobre"', kind: 'text', default: 'Sobre a clínica' },
      {
        key: 'home.aboutText',
        label: 'Texto do "Sobre"',
        kind: 'textarea',
        default: 'Estética e micropigmentação, da sobrancelha às massagens terapêuticas, com atendimento próximo, técnico e feito para você.',
      },
      {
        key: 'home.specialtiesLead',
        label: 'Texto das especialidades',
        kind: 'textarea',
        default: 'Um procedimento para cada etapa do seu cuidado, da limpeza de pele à micropigmentação.',
      },
    ],
  },
  {
    title: 'Página inicial — como funciona',
    page: '/',
    fields: [
      { key: 'home.step1Title', label: 'Passo 1 — título', kind: 'text', default: 'Escolha o serviço' },
      { key: 'home.step1Text', label: 'Passo 1 — texto', kind: 'textarea', default: 'Navegue pelas especialidades e encontre o procedimento ideal para você.' },
      { key: 'home.step2Title', label: 'Passo 2 — título', kind: 'text', default: 'Escolha o dia e o horário' },
      { key: 'home.step2Text', label: 'Passo 2 — texto', kind: 'textarea', default: 'Veja a agenda real da clínica e selecione o horário que encaixa na sua rotina.' },
      { key: 'home.step3Title', label: 'Passo 3 — título', kind: 'text', default: 'Confirme e pronto' },
      { key: 'home.step3Text', label: 'Passo 3 — texto', kind: 'textarea', default: 'Informe seus dados e receba a confirmação do horário pelo WhatsApp.' },
    ],
  },
  {
    title: 'Página inicial — por que a Noely',
    page: '/',
    fields: [
      { key: 'home.why1Title', label: 'Motivo 1 — título', kind: 'text', default: 'Atendimento individual' },
      { key: 'home.why1Text', label: 'Motivo 1 — texto', kind: 'textarea', default: 'Cada procedimento pensado para a sua pele, o seu tempo e o seu conforto.' },
      { key: 'home.why2Title', label: 'Motivo 2 — título', kind: 'text', default: 'Ambiente acolhedor' },
      { key: 'home.why2Text', label: 'Motivo 2 — texto', kind: 'textarea', default: 'Um espaço tranquilo, pensado do início ao fim para o seu bem-estar.' },
      { key: 'home.why3Title', label: 'Motivo 3 — título', kind: 'text', default: 'Agendamento simples' },
      { key: 'home.why3Text', label: 'Motivo 3 — texto', kind: 'textarea', default: 'Escolha o serviço, a data e o horário em poucos toques, direto do celular.' },
      { key: 'home.instagramText', label: 'Texto do Instagram', kind: 'text', default: 'Procedimentos, resultados e bastidores da clínica no Instagram.' },
      { key: 'home.ctaTitle', label: 'Chamada do final da página', kind: 'text', default: 'Vamos agendar seu horário?' },
    ],
  },
  {
    title: 'Página Serviços',
    page: '/servicos',
    fields: [
      { key: 'services.title', label: 'Título', kind: 'text', default: 'Nossos serviços' },
      {
        key: 'services.description',
        label: 'Texto',
        kind: 'textarea',
        default: 'Os procedimentos da clínica, com duração e valor. Escolha um e siga direto para o agendamento.',
      },
      { key: 'services.image', label: 'Foto do topo', kind: 'image', default: '/services/limpeza-de-pele.jpg' },
    ],
  },
  {
    title: 'Página Agendar',
    page: '/agendar',
    fields: [
      { key: 'booking.title', label: 'Título', kind: 'text', default: 'Agende seu horário' },
      { key: 'booking.description', label: 'Texto', kind: 'textarea', default: 'Escolha o procedimento, o dia e o horário. A confirmação chega pelo WhatsApp.' },
      { key: 'booking.image', label: 'Foto do topo', kind: 'image', default: '/services/micropigmentacao.jpg' },
    ],
  },
  {
    title: 'Página Contato',
    page: '/contato',
    fields: [
      { key: 'contact.title', label: 'Título', kind: 'text', default: 'Fale conosco' },
      { key: 'contact.description', label: 'Texto', kind: 'textarea', default: 'WhatsApp, Instagram, endereço e horários da clínica em Camaçari (BA).' },
      { key: 'contact.image', label: 'Foto do topo', kind: 'image', default: '/services/massagens-terapias-corporais.jpg' },
    ],
  },
];

export const SITE_DEFAULTS: Record<string, string> = Object.fromEntries(
  SITE_SECTIONS.flatMap((s) => s.fields.map((f) => [f.key, f.default])),
);
