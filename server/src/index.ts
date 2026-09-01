import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`API da Noely Cerqueira rodando em http://localhost:${env.PORT}`);
});
