export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  if (!response.ok) {
    let message = 'Không kết nối được máy chủ.';
    let code: string | undefined;
    try {
      const body = await response.json();
      message = Array.isArray(body.message) ? body.message.join(', ') : body.message || message;
      if (typeof body.code === 'string') code = body.code;
    } catch {
      /* HTTP fallback */
    }
    const retry = response.headers.get('Retry-After') || '';
    const seconds = /^\d+$/.test(retry) ? Number(retry) : 15;
    throw new ApiError(
      response.status,
      message,
      code,
      Math.min(300, Math.max(1, Number.isFinite(seconds) ? seconds : 15)) * 1000,
    );
  }
  return response.json() as Promise<T>;
}
