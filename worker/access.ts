import { createMiddleware } from 'hono/factory'
import type { WorkerEnv } from './http.ts'
import { authenticate, unauthorized } from './sessions.ts'

export const requireSession = createMiddleware<WorkerEnv>(async (c, next) => {
  const url = new URL(c.req.url)
  const method = c.req.method
  const path = url.pathname

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && c.req.header('Origin') !== url.origin) {
    return c.json({ error: '請求來源不符。' }, 403)
  }

  if (
    (method === 'GET' && (path === '/login' || path === '/api/health' ||
      /^\/login-assets\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(path))) ||
    (method === 'POST' && path === '/api/sessions')
  ) {
    return next()
  }

  if (await authenticate(c)) return next()

  const isPage = !path.startsWith('/api/') &&
    (path === '/' || c.req.header('Sec-Fetch-Dest') === 'document' ||
      c.req.header('Accept')?.includes('text/html'))
  return method === 'GET' && isPage ? c.redirect('/login') : unauthorized(c)
})
