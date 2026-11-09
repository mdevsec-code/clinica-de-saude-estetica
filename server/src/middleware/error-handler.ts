import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';

// Nunca expor stack trace ou mensagens técnicas ao cliente (item 69 do escopo).
// Detalhes completos vão para o log; o cliente recebe uma mensagem compreensível.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos.', details: err.flatten() },
    });
  }

  // Erros do próprio express.json (corpo grande demais / JSON malformado)
  // não são AppError — sem isto caíam no 500 "erro interno" abaixo, quando
  // na verdade são um problema do pedido, não do servidor.
  const bodyErrorType = (err as { type?: string } | null)?.type;
  if (bodyErrorType === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'O arquivo ou os dados enviados são grandes demais.' } });
  }
  if (bodyErrorType === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Dados enviados em formato inválido.' } });
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      req.log?.error(err);
    }
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
  }

  req.log?.error(err);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a operação. Tente novamente.' },
  });
}
