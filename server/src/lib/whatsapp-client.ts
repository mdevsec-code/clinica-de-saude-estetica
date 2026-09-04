import { env } from '../config/env';

export function isWhatsappConfigured(): boolean {
  return Boolean(env.WHATSAPP_CLOUD_API_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

// Normaliza pro formato que a Cloud API espera: só dígitos, com código do
// país. Os números já cadastrados aqui (Customer.whatsapp) vêm de um
// telefone brasileiro com DDD sem o "55" — completa se faltar.
function normalizePhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

// Cliente fino para a WhatsApp Cloud API (Meta) — envia mensagem de texto
// livre. Fora da janela de 24h de atendimento (o normal para um lembrete
// disparado pela clínica, não em resposta a uma mensagem do cliente), a
// Cloud API exige um "template" pré-aprovado no Meta Business Manager em vez
// de texto livre — por isso o parâmetro templateName: quando ausente, tenta
// texto livre (funciona só dentro da janela de 24h); quando informado, usa o
// template configurado. Configurar o template certo no Business Manager é
// responsabilidade de quem operar isso em produção, fora do alcance do código.
interface SendWhatsappInput {
  to: string;
  body: string;
  templateName?: string;
  templateParams?: string[];
}

export async function sendWhatsappMessage(input: SendWhatsappInput): Promise<{ messageId: string }> {
  if (!isWhatsappConfigured()) {
    throw new Error(
      'WhatsApp Cloud API não configurada — defina WHATSAPP_CLOUD_API_TOKEN e WHATSAPP_PHONE_NUMBER_ID no .env do servidor.',
    );
  }

  const to = normalizePhoneNumber(input.to);
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const payload = input.templateName
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: input.templateName,
          language: { code: 'pt_BR' },
          components: input.templateParams?.length
            ? [{ type: 'body', parameters: input.templateParams.map((text) => ({ type: 'text', text })) }]
            : undefined,
        },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: input.body },
      };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_CLOUD_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => null)) as
    | { messages?: { id: string }[]; error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(data?.error?.message ?? `Falha ao enviar WhatsApp (HTTP ${response.status}).`);
  }

  return { messageId: data?.messages?.[0]?.id ?? '' };
}
