export const renewalPath = '/api/sessions/current/renewals'

export async function request(path: string, method = 'GET', body?: object) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null)
    const message = payload && typeof payload === 'object' && 'error' in payload &&
      typeof payload.error === 'string' ? payload.error : '目前無法完成操作，請稍後再試。'
    throw new ApiError(response.status, message)
  }
  if (path !== '/api/health' && !path.startsWith('/api/sessions')) {
    // A separate write records activity while keeping GET endpoints read-only.
    void fetch(renewalPath, { method: 'POST', keepalive: true }).catch(() => {})
  }
  return response
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
