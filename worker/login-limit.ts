import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { loginLimitTable } from './schema.ts'

export async function takeLoginAttempt(db: DrizzleD1Database, account: number, now: number) {
  const window = Math.floor(now / 60_000)
  const byAccount = eq(loginLimitTable.account, account)

  // Only a request that successfully claims the observed counter may verify a password.
  for (let retry = 0; retry < 5; retry++) {
    const current = await db.select().from(loginLimitTable).where(byAccount).get()
    if (!current) {
      const created = await db.insert(loginLimitTable).values({ account, window, attempts: 1 })
        .onConflictDoNothing().returning().get()
      if (created) return true
      continue
    }

    if (current.window > window) return false
    const attempts = current.window === window ? current.attempts + 1 : 1
    if (attempts > 30) return false

    const updated = await db.update(loginLimitTable).set({ window, attempts })
      .where(and(byAccount, eq(loginLimitTable.window, current.window), eq(loginLimitTable.attempts, current.attempts)))
      .returning().get()
    if (updated) return true
  }

  return false
}
