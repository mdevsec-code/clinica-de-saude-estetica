import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../utils/errors';
import { isWhatsappConfigured, sendWhatsappMessage } from '../../lib/whatsapp-client';

// Disparo é sempre manual (clique de um ADMIN — ver requireRole na rota),
// nunca automático em background: o projeto não tem worker/cron rodando
// hoje, então "lembrete automático" aqui significa "aparece sozinho no
// dashboard/agenda quando o procedimento é concluído" (ver reminders.service),
// e o envio por WhatsApp é um botão dentro daquele lembrete, não um job
// silencioso disparando mensagem sem ninguém decidir o momento.
export async function sendReturnReminderWhatsapp(tenantId: string, reminderId: string) {
  if (!isWhatsappConfigured()) {
    throw new Error('WhatsApp Cloud API não configurada. Peça para o responsável técnico definir as credenciais no servidor.');
  }

  const reminder = await prisma.returnReminder.findFirst({
    where: { id: reminderId, tenantId },
    include: {
      customer: { select: { name: true, whatsapp: true } },
      procedureRecord: { include: { service: { select: { name: true } } } },
    },
  });
  if (!reminder) throw new NotFoundError('Lembrete não encontrado.');

  const dueAtStr = formatInTimeZone(reminder.dueAt, 'UTC', 'dd/MM/yyyy');
  const firstName = reminder.customer.name.trim().split(/\s+/)[0];
  const body = `Oi, ${firstName}! Passando para lembrar do seu retorno de ${reminder.procedureRecord.service.name}, previsto para ${dueAtStr}. Quer agendar um horário? 😊`;

  const result = await sendWhatsappMessage({ to: reminder.customer.whatsapp, body });

  await prisma.returnReminder.update({
    where: { id: reminder.id },
    data: { status: 'NOTIFIED', notifiedAt: new Date() },
  });

  return result;
}

export async function sendBirthdayWhatsapp(tenantId: string, customerId: string) {
  if (!isWhatsappConfigured()) {
    throw new Error('WhatsApp Cloud API não configurada. Peça para o responsável técnico definir as credenciais no servidor.');
  }

  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
  if (!customer) throw new NotFoundError('Paciente não encontrado.');

  const firstName = customer.name.trim().split(/\s+/)[0];
  const body = `Feliz aniversário, ${firstName}! 🎉 A equipe da Noely Cerqueira deseja um dia lindo, cheio de motivos para sorrir. Um abraço!`;

  return sendWhatsappMessage({ to: customer.whatsapp, body });
}
