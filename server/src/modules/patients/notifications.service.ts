import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../utils/errors';
import { isWhatsappConfigured, sendWhatsappMessage } from '../../lib/whatsapp-client';
import { isWhatsappConnected, sendWhatsappText } from '../whatsapp/whatsapp-connection';

// Canal de envio: o WhatsApp da clínica conectado por QR code (painel >
// WhatsApp) quando estiver conectado; senão a Cloud API da Meta, se
// configurada no .env. Sem nenhum dos dois, erro claro para a tela.
async function sendThroughAvailableChannel(tenantId: string, to: string, body: string) {
  if (isWhatsappConnected(tenantId)) {
    await sendWhatsappText(tenantId, to, body);
    return { messageId: '' };
  }
  if (isWhatsappConfigured()) return sendWhatsappMessage({ to, body });
  throw new Error('WhatsApp não conectado. Conecte o WhatsApp da clínica na aba WhatsApp do painel.');
}

// Lembrete de RETORNO e felicitação de aniversário: disparo manual (clique
// de um ADMIN — ver requireRole na rota). Os envios automáticos (boas-vindas,
// confirmação, lembrete do dia) ficam em modules/whatsapp.
export async function sendReturnReminderWhatsapp(tenantId: string, reminderId: string) {
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

  const result = await sendThroughAvailableChannel(tenantId, reminder.customer.whatsapp, body);

  await prisma.returnReminder.update({
    where: { id: reminder.id },
    data: { status: 'NOTIFIED', notifiedAt: new Date() },
  });

  return result;
}

export async function sendBirthdayWhatsapp(tenantId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
  if (!customer) throw new NotFoundError('Paciente não encontrado.');

  const firstName = customer.name.trim().split(/\s+/)[0];
  const body = `Feliz aniversário, ${firstName}! 🎉 A equipe da Noely Cerqueira deseja um dia lindo, cheio de motivos para sorrir. Um abraço!`;

  return sendThroughAvailableChannel(tenantId, customer.whatsapp, body);
}
