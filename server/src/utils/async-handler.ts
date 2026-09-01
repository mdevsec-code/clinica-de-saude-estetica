import type { NextFunction, Request, Response } from 'express';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

// Evita repetir try/catch em toda rota async — encaminha qualquer rejeição
// para o error-handler central em vez de derrubar o processo.
export function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
