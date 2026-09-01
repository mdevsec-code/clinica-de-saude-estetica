export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = 'BAD_REQUEST',
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado.') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Este horário não está mais disponível.') {
    super(message, 409, 'CONFLICT');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Credenciais inválidas.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Você não tem permissão para esta ação.') {
    super(message, 403, 'FORBIDDEN');
  }
}
