const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// Camada única de comunicação com o backend (item 64 do escopo) — nenhuma
// view faz fetch diretamente. Erros técnicos nunca vazam ao usuário final:
// cada service específico decide a mensagem amigável a partir do ApiError.
export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('noely_admin_token');

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = 'Não foi possível concluir a operação. Tente novamente.';
    try {
      const body = await response.json();
      if (body?.error?.message) message = body.error.message;
    } catch {
      // resposta sem corpo JSON — mantém a mensagem padrão
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
