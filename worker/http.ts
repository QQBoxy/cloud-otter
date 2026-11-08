import type { Context } from 'hono'

export type Session = { username: string; expires_at: number }

export type WorkerEnv = {
  Bindings: {
    ASSETS: Fetcher
    DB: D1Database
    LOGIN_IP_LIMIT: { limit(input: { key: string }): Promise<{ success: boolean }> }
    ADMIN_1_USERNAME: string
    ADMIN_1_PASSWORD_HASH: string
    ADMIN_2_USERNAME: string
    ADMIN_2_PASSWORD_HASH: string
    SESSION_KEY: string
  }
  Variables: { session: Session; tokenHash: string }
}

export async function jsonObject(c: Context<WorkerEnv>): Promise<Record<string, unknown>> {
  const value: unknown = await c.req.json().catch(() => null)
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}
