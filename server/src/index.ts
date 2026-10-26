import { createApp } from './app';
import { env } from './config/env';
import { startGoogleCalendarSyncLoop } from './modules/google-calendar/google-calendar.service';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`API da Noely Cerqueira rodando em http://localhost:${env.PORT}`);
  startGoogleCalendarSyncLoop(env.GOOGLE_CALENDAR_SYNC_INTERVAL_MIN);
});
