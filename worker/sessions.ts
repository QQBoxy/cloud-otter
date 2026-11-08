import { Buffer } from 'node:buffer'
import { createHmac, randomBytes } from 'node:crypto'
import { and, eq, gt, lte, or } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { jsonObject, type WorkerEnv } from './http.ts'
import { takeLoginAttempt } from './login-limit.ts'
import { passwordRecord, verifyPassword } from './password.ts'
import { sessionTable } from './schema.ts'

export const sessions = new Hono<WorkerEnv>()
const cookie = '__Host-session'
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' } as const
const sessionAge = 8 * 60 * 60
const tokenPattern = /^[0-9a-f]{64}$/

function tokenHash(token: string, key: string) {
  if (!tokenPattern.test(key)) throw new Error('Invalid session key')
  return createHmac('sha256', Buffer.from(key, 'hex')).update(token).digest('hex')
}

export function unauthorized(c: Context<WorkerEnv>, error = '請先登入。') {
  c.header('WWW-Authenticate', 'Session realm="cloud-otter"')
  return c.json({ error }, 401)
}

function limited(c: Context<WorkerEnv>) {
  c.header('Retry-After', '60')
  return c.json({ error: '登入嘗試太多次，請稍後再試。' }, 429)
}

export async function authenticate(c: Context<WorkerEnv>) {
  const token = getCookie(c, cookie)
  if (!token || !tokenPattern.test(token)) return false

  const hash = tokenHash(token, c.env.SESSION_KEY)
  const session = await drizzle(c.env.DB)
    .select({ username: sessionTable.username, expires_at: sessionTable.expiresAt })
    .from(sessionTable)
    .where(and(eq(sessionTable.tokenHash, hash), gt(sessionTable.expiresAt, Date.now())))
    .get()
  if (!session) return false

  c.set('session', session)
  c.set('tokenHash', hash)
  return true
}

sessions.post('/', async (c) => {
  const { username, password } = await jsonObject(c)
  if (
    typeof username !== 'string' || !username.trim() || username.length > 128 ||
    typeof password !== 'string' || !password || Buffer.byteLength(password) > 256
  ) {
    return c.json({ error: '請輸入有效的帳號與密碼。' }, 400)
  }

  const ip = c.req.header('CF-Connecting-IP') ?? 'local'
  if (!(await c.env.LOGIN_IP_LIMIT.limit({ key: ip })).success) return limited(c)

  const admins = [
    { username: c.env.ADMIN_1_USERNAME, hash: c.env.ADMIN_1_PASSWORD_HASH },
    { username: c.env.ADMIN_2_USERNAME, hash: c.env.ADMIN_2_PASSWORD_HASH },
  ] as const
  if (admins[0].username === admins[1].username ||
    admins.some((admin) => !admin.username || !passwordRecord.test(admin.hash))) {
    throw new Error('Invalid administrator configuration')
  }

  const index = admins.findIndex((admin) => admin.username === username.trim())
  const now = Date.now()
  const db = drizzle(c.env.DB)
  // Two account buckets plus one shared bucket for unrecognized names.
  if (!(await takeLoginAttempt(db, index, now))) return limited(c)

  const admin = admins[index]
  if (!(await verifyPassword(password, (admin ?? admins[0]).hash)) || !admin) {
    return unauthorized(c, '帳號或密碼錯誤。')
  }

  const token = randomBytes(32).toString('hex')
  const hash = tokenHash(token, c.env.SESSION_KEY)
  const previous = getCookie(c, cookie)
  const previousHash = previous && tokenPattern.test(previous) ? tokenHash(previous, c.env.SESSION_KEY) : ''
  await db.batch([
    db.delete(sessionTable).where(or(lte(sessionTable.expiresAt, now), eq(sessionTable.tokenHash, previousHash))),
    db.insert(sessionTable).values({ tokenHash: hash, username: admin.username, expiresAt: now + sessionAge * 1000 }),
  ])
  setCookie(c, cookie, token, { ...cookieOptions, maxAge: sessionAge })
  c.header('Location', '/api/sessions/current')
  return c.body(null, 201)
})

sessions.get('/current', (c) => c.json(c.get('session')))

sessions.delete('/current', async (c) => {
  await drizzle(c.env.DB).delete(sessionTable).where(eq(sessionTable.tokenHash, c.get('tokenHash'))).run()
  deleteCookie(c, cookie, cookieOptions)
  return c.body(null, 204)
})
