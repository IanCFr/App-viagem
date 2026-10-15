export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, { method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000), ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || 'Não foi possível concluir a solicitação.', response.status);
  return data as T;
}
