import rateLimit from 'express-rate-limit';

// Protege o login contra força bruta (item 67 do escopo): poucas tentativas
// por IP em uma janela curta. Mensagem genérica — não revela se o e-mail existe.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' } },
});

// Evita spam/abuso no endpoint público de criação de agendamento (qualquer
// visitante não autenticado pode chamá-lo).
export const bookingRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Muitas tentativas de agendamento. Aguarde alguns minutos.' } },
});
