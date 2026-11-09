// Variáveis das mensagens de WhatsApp — os mesmos nomes que o servidor
// preenche no envio (ver buildVariables em server/src/modules/whatsapp/
// whatsapp-automation.ts). `sample` é só para a pré-visualização do painel.
export interface MessageVariable {
  name: string;
  label: string;
  sample: () => string;
}

function sampleGreeting() {
  const hour = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Bahia' }).format(new Date()));
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export const MESSAGE_VARIABLES: MessageVariable[] = [
  { name: 'Saudacao', label: 'Saudação', sample: sampleGreeting },
  { name: 'Cliente', label: 'Cliente', sample: () => 'Ana' },
  { name: 'Data', label: 'Data', sample: () => '23/08/2026' },
  { name: 'Horario', label: 'Horário', sample: () => '10:30' },
  { name: 'Servico', label: 'Serviço', sample: () => 'Limpeza de pele' },
  { name: 'Profissional', label: 'Profissional', sample: () => 'Noely Cerqueira' },
  { name: 'Valor', label: 'Valor', sample: () => 'R$ 180,00' },
  { name: 'LinkAgendamento', label: 'Link de agendamento', sample: () => `${window.location.origin}/agendar` },
  { name: 'Localizacao', label: 'Localização', sample: () => 'https://share.google/4RGBwnV5EyzVVzmcP' },
];

export function renderSample(body: string) {
  const values = Object.fromEntries(MESSAGE_VARIABLES.map((v) => [v.name, v.sample()]));
  return body.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}

// Formatação do WhatsApp (*negrito*, _itálico_, ~riscado~) convertida em
// trechos para o template renderizar com <strong>/<em>/<s> — sem v-html: o
// texto é digitado no painel e nunca vira HTML. Mesmas regras do app: o
// marcador precisa encostar no texto (sem espaço logo depois de abrir nem
// logo antes de fechar) e não atravessa quebras de linha.
export interface FormattedSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  link?: boolean;
}

const MARKERS: Record<string, keyof Pick<FormattedSegment, 'bold' | 'italic' | 'strike'>> = { '*': 'bold', _: 'italic', '~': 'strike' };
const FORMAT_RE = /([*_~])(?=\S)([^\n]*?\S)\1(?![\w*_~])/g;
const URL_RE = /(https?:\/\/[^\s]+)/g;

function splitLinks(segment: FormattedSegment): FormattedSegment[] {
  return segment.text
    .split(URL_RE)
    .filter(Boolean)
    .map((part) => ({ ...segment, text: part, link: /^https?:\/\//.test(part) }));
}

function parse(text: string, inherited: Omit<FormattedSegment, 'text'>): FormattedSegment[] {
  const out: FormattedSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(FORMAT_RE)) {
    const [whole, marker, inner] = match;
    const index = match.index ?? 0;
    if (index > last) out.push(...splitLinks({ ...inherited, text: text.slice(last, index) }));
    // Um nível de aninhamento (ex.: *_negrito e itálico_*), como no app.
    out.push(...parse(inner, { ...inherited, [MARKERS[marker]]: true }));
    last = index + whole.length;
  }
  if (last < text.length) out.push(...splitLinks({ ...inherited, text: text.slice(last) }));
  return out;
}

export function formatWhatsapp(text: string): FormattedSegment[][] {
  return text.split('\n').map((line) => parse(line, {}));
}
