import { ValidatedReads } from './validated-read.js';
const reads = new ValidatedReads();
export const clearReadMemory = () => reads.clear();
export async function validatedApi<T>(path: string, signal?: AbortSignal): Promise<T> {
  const read = <R>(requestPath: string) =>
    api<R>(requestPath, requestPath === '/journal-state' ? {} : { signal });
  try {
    return await reads.read<T>(path, read, signal);
  } catch (error) {
    if ((error as Error).name !== 'ReadInvalidatedError' || signal?.aborted) throw error;
    // One bounded retry when a concurrent write invalidated this read.
    return reads.read<T>(path, read, signal);
  }
}
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
  const mutation = !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase());
  if (mutation) reads.clear();
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  if (mutation || [401, 403].includes(response.status)) reads.clear();
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
