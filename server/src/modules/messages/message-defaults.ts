import type { MessageTemplateKey } from '@prisma/client';

// Textos padrão das mensagens de WhatsApp — partem dos que a clínica já
// usava no agendas.link, com as variáveis que o servidor preenche no envio
// (lista e valores em buildVariables, whatsapp-automation.ts). Valem
// enquanto a clínica não editar o modelo; "Restaurar texto padrão" volta a
// eles.
//
// Fluxo: a paciente escreve → Saudação (WELCOME). Agenda pelo site →
// Confirmação, pedindo "SIM". Responde "sim" → agradecimento
// (CONFIRMATION_THANKS). Depois, lembrete 1 dia antes e 2 horas antes.
export const DEFAULT_MESSAGE_TEMPLATES: Record<MessageTemplateKey, string> = {
  WELCOME: `👋 {Saudacao}, {Cliente}, seja muito bem-vindo(a)! ✨

Sou Noely Cerqueira, especialista em *Estética e cuidados com a beleza*. Meu propósito é proporcionar a você uma experiência única, com excelência, conforto, segurança e bem-estar em cada atendimento. 💫

Para sua comodidade, o agendamento é feito de forma online — escolha o melhor dia e horário para você: 📅
{LinkAgendamento}

📍 Você também pode conferir nossa localização pelo link e vir nos visitar!
{Localizacao}

Será um prazer cuidar de você e realçar ainda mais a sua beleza! 🌸
Clínica de Beleza e Estética Noely — Seu espaço de cuidado e autoestima! 💖`,

  CONFIRMATION: `❕ *Confirmação do seu agendamento*

Para garantir transparência e organização do seu atendimento, seguem os detalhes da sua reserva:

📅 *Data:* {Data}
🕘 *Horário:* {Horario}
🛠️ *Serviço:* {Servico}
👤 *Profissional:* {Profissional}
💰 *Investimento:* {Valor}

⏳ Pedimos que chegue com 10 minutos de antecedência para otimizar seu atendimento.

Caso precise reagendar, entre em contato com antecedência para melhor gestão da agenda.

✅ *Responda SIM para confirmar seu horário.*

Aguardamos você!`,

  CONFIRMATION_THANKS: `Perfeito, {Cliente}! Seu horário está confirmado ✨

📅 {Data} às {Horario} — {Servico}

Até lá! Será um prazer te receber! 💖`,

  REMINDER_DAY_BEFORE: `{Saudacao}, {Cliente}! Tudo bem? ✨

Passando para te lembrar que você tem um horário agendado conosco *amanhã, {Data}, às {Horario}* — {Servico}.

📌 Obs: Caso esteja com sintomas de gripe, pedimos que considere remarcar seu atendimento ou, se preferir, venha utilizando máscara, assim garantimos a segurança e o bem-estar de todos. 😷

Até amanhã! Será um prazer te receber! 💫`,

  REMINDER_2H: `{Saudacao}, {Cliente}! ✨

Seu horário é *hoje às {Horario}* — {Servico}.

📍 Nossa localização: {Localizacao}

Até já! 💫`,

  // Agendamento que ficou antes da abertura do dia (o sábado passou a abrir
  // às 09:00). {NovoHorario} é o horário de abertura; respondendo SIM, o
  // sistema remarca sozinho e manda RESCHEDULE_DONE.
  RESCHEDULE_OFFER: `{Saudacao}, {Cliente}! Tudo bem? ✨

Uma atualização importante: aos sábados, nosso atendimento agora começa às *{NovoHorario}*.

Seu horário de *{Servico}* está marcado para *{Data} às {Horario}*. Podemos passar para as *{NovoHorario}* do mesmo dia?

✅ *Responda SIM para confirmar o novo horário.*
Se preferir outro horário, é só nos chamar por aqui. 💛`,

  RESCHEDULE_DONE: `Prontinho, {Cliente}! ✨ Seu horário foi remarcado:

📅 {Data} às {Horario} — {Servico}

Obrigada pela compreensão! Até lá! 💖`,
};

export const MESSAGE_TEMPLATE_KEYS = Object.keys(DEFAULT_MESSAGE_TEMPLATES) as MessageTemplateKey[];
