import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { restoreWhatsappSessions } from './modules/whatsapp/whatsapp-connection';
import { startReminderScheduler } from './modules/whatsapp/whatsapp-automation';
import { startGoogleCalendarSyncLoop } from './modules/google-calendar/google-calendar.service';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`API da Noely Cerqueira rodando em http://localhost:${env.PORT}`);

  // WhatsApp por QR code: reconecta as sessões já vinculadas (sem exigir
  // escanear de novo a cada reinício/deploy) e liga a varredura de lembretes.
  prisma.tenant
    .findMany({ select: { id: true } })
    .then((tenants) => restoreWhatsappSessions(tenants.map((t) => t.id)))
    .catch((err) => console.error('Falha ao restaurar sessões do WhatsApp', err));
  startReminderScheduler();
  startGoogleCalendarSyncLoop(env.GOOGLE_CALENDAR_SYNC_INTERVAL_MIN);
});
