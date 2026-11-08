import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { requireSession } from './access.ts'
import { announcements } from './announcements.ts'
import type { WorkerEnv } from './http.ts'
import { sessions } from './sessions.ts'

const app = new Hono<WorkerEnv>()

function asset(c: Context<WorkerEnv>, path: string) {
  return c.env.ASSETS.fetch(new Request(new URL(path, c.req.url), c.req.raw))
}

app.use('*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
})

app.use('*', requireSession)

app.use('/api/*', bodyLimit({
  maxSize: 8192,
  onError: (c) => c.json({ error: '請求內容過大。' }, 413),
}))

app.get('/login', (c) => asset(c, '/login.html'))
app.get('/login-assets/:file', (c) => c.env.ASSETS.fetch(c.req.raw))
app.get('/api/health', (c) => c.json({ ok: true }))

app.route('/api/sessions', sessions)
app.route('/api/announcements', announcements)

app.get('/', (c) => asset(c, '/index.html'))
app.get('*', (c) => c.req.path.startsWith('/api/')
  ? c.json({ error: '找不到這個 API。' }, 404)
  : c.env.ASSETS.fetch(c.req.raw))

app.onError((_error, c) => c.json({ error: '服務暫時無法使用，請稍後再試。' }, 500))

export default app
