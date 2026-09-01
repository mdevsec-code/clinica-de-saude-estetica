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
