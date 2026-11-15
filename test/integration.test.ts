import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { unstable_startWorker } from 'wrangler'
import type { TransactionPage, YearSummary } from '../shared/ledger.ts'
import '../scripts/dev-env.ts'
import { MAX_ANNOUNCEMENTS } from '../worker/announcement-input.ts'
import { hashPassword } from '../worker/password.ts'

const run = promisify(execFile)
const wrangler = 'node_modules/wrangler/bin/wrangler.js'
const environment = {
  ...process.env,
  WRANGLER_SEND_METRICS: 'false',
  CI: 'true',
}
const testPassword = 'test-only announcement password'
const sessionKey = 'ab'.repeat(32)

test('Worker protects assets and two administrators share announcements and expenses', { timeout: 60_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cloud-otter-test-'))
  const envFile = join(directory, 'test.env')
  const state = join(directory, 'state')
  let worker: Awaited<ReturnType<typeof unstable_startWorker>> | undefined = undefined
  t.after(async () => {
    try {
      await worker?.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true, maxRetries: 3 })
    }
  })

  const [firstHash, secondHash] = await Promise.all([hashPassword(testPassword), hashPassword(testPassword)])
  await writeFile(envFile, [
    'ADMIN_1_USERNAME=test-one',
    'ADMIN_1_PASSWORD_HASH=' + firstHash,
    'ADMIN_2_USERNAME=test-two',
    'ADMIN_2_PASSWORD_HASH=' + secondHash,
    'SESSION_KEY=' + sessionKey,
  ].join('\n'), { mode: 0o600 })

  const wranglerOptions = { env: { ...environment, WRANGLER_LOG_PATH: join(directory, 'wrangler.log') } }
  await run(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state], wranglerOptions)
  const expiredToken = '00'.repeat(32)
  const expiredHash = createHmac('sha256', Buffer.from(sessionKey, 'hex')).update(expiredToken).digest('hex')
  const activeToken = '11'.repeat(32)
  const activeHash = createHmac('sha256', Buffer.from(sessionKey, 'hex')).update(activeToken).digest('hex')
  const initialExpiry = Date.now() + 60_000
  await run(process.execPath, [wrangler, 'd1', 'execute', 'DB', '--local', '--persist-to', state, '--command',
    `INSERT INTO sessions VALUES ('${expiredHash}', 'test-one', 1), ('${activeHash}', 'test-two', ${initialExpiry})`,
  ], wranglerOptions)

  worker = await unstable_startWorker({
    config: 'wrangler.jsonc',
    envFiles: [envFile],
    dev: {
      remote: false,
      server: { hostname: '127.0.0.1', port: 0 },
      inspector: { port: 0 },
      persist: state,
      logLevel: 'warn',
    },
  })
  const origin = (await worker.url).origin

  const request = (path: string, method = 'GET', cookie?: string, body?: object, source = origin) =>
    fetch(origin + path, {
      method,
      redirect: 'manual',
      headers: {
        Origin: source,
        ...(cookie && { Cookie: cookie }),
        ...(body && { 'Content-Type': 'application/json' }),
      },
      body: body && JSON.stringify(body),
    })

  const login = (username: string, password = testPassword) =>
    request('/api/sessions', 'POST', undefined, { username, password })
  const status = async (path: string, expected: number, cookie?: string) => {
    const response = await request(path, 'GET', cookie)
    assert.equal(response.status, expected, path)
    return response
  }

  const home = await status('/', 302)
  assert.equal(home.headers.get('location'), '/login')
  assert.equal((await status('/announcements', 302)).headers.get('location'), '/login')
  assert.equal((await status('/menu', 302)).headers.get('location'), '/login')
  assert.equal((await status('/ledger', 302)).headers.get('location'), '/login')
  const page = await status('/login', 200)
  const loginHtml = await page.text()
  assert.match(loginHtml, /<title>管理員登入 · 海獺盒子<\/title>/)
  assert.match(loginHtml, /rel="manifest" href="\/manifest\.webmanifest"/)
  const favicon = /rel="icon"[^>]+href="\/icons\/otter-32\.png"/
  assert.match(loginHtml, favicon)
  assert.equal((await status('/icons/otter-32.png', 200)).headers.get('content-type'), 'image/png')
  const manifest = await status('/manifest.webmanifest', 200)
  const { name, short_name, start_url, scope, icons } = await manifest.json() as {
    name: string; short_name: string; start_url: string; scope: string; icons: { src: string; sizes: string }[]
  }
  assert.equal(name, '海獺盒子')
  assert.equal(short_name, '海獺盒子')
  assert.equal(start_url, '/')
  assert.equal(scope, '/')
  assert.deepEqual(icons.map(({ sizes }) => sizes), ['192x192', '512x512'])
  for (const icon of icons) {
    assert.equal((await status(icon.src, 200)).headers.get('content-type'), 'image/png')
  }
  const serviceWorker = await status('/service-worker.js', 200)
  assert.match(serviceWorker.headers.get('content-type') ?? '', /javascript/i)
  assert.equal(serviceWorker.headers.get('cache-control'), 'no-store')
  await status('/icons/private.js', 401)
  const publicAsset = loginHtml.match(/src="(\/login-assets\/[^"]+)"/)?.[1]
  assert.ok(publicAsset)
  await status(publicAsset, 200)
  await status('/api/health', 200)
  await status('/api/announcements', 401)
  await status('/api/announcements?view=recent', 401)
  await status('/api/transactions', 401)
  await status('/api/transactions/summary', 401)
  const explorer = await request('/cdn-cgi/local/explorer/api/d1/database')
  assert.ok([401, 404].includes(explorer.status), 'local D1 explorer must be inaccessible')
  await status('/index.html', 401)
  await status('/api/sessions/current', 401, '__Host-session=' + expiredToken)
  const renewal = '/api/sessions/current/renewals'
  assert.equal((await request(renewal, 'POST', '__Host-session=' + expiredToken)).status, 401)
  const activeCookie = '__Host-session=' + activeToken
  const getExpiry = async () => (await (await status('/api/sessions/current', 200, activeCookie)).json() as { expires_at: number }).expires_at
  assert.equal(await getExpiry(), initialExpiry)
  await status('/api/announcements', 200, activeCookie)
  assert.equal(await getExpiry(), initialExpiry, 'reading a resource must leave the session unchanged')
  const renewStarted = Date.now()
  const renewed = await request(renewal, 'POST', activeCookie)
  assert.equal(renewed.status, 204)
  assert.match(renewed.headers.get('set-cookie') ?? '', /Max-Age=604800\b/)
  assert.ok(await getExpiry() >= renewStarted + 604_800_000)
  assert.equal((await request('/api/sessions/current', 'DELETE', activeCookie)).status, 204)
  assert.equal((await request(renewal, 'POST', activeCookie)).status, 401)

  const privateAsset = (await readFile('dist/index.html', 'utf8')).match(/src="(\/assets\/[^"]+)"/)?.[1]
  assert.ok(privateAsset)
  await status(privateAsset, 401)
  assert.equal((await request(privateAsset, 'HEAD')).status, 401)
  await status('/login-assets/%2e%2e' + privateAsset, 401)

  assert.equal((await login('test-one', 'wrong password')).status, 401)
  const firstLogin = await login('test-one')
  const secondLogin = await login('test-two')
  assert.equal(firstLogin.status, 201)
  assert.equal(secondLogin.status, 201)
  assert.equal(firstLogin.headers.get('location'), '/api/sessions/current')
  const setCookie = firstLogin.headers.get('set-cookie')
  assert.ok(setCookie)
  assert.match(setCookie, /HttpOnly/i)
  assert.match(setCookie, /Secure/i)
  assert.match(setCookie, /SameSite=Lax/i)
  assert.match(setCookie, /Max-Age=604800\b/)
  const first = setCookie.split(';')[0]
  const second = secondLogin.headers.get('set-cookie')!.split(';')[0]
  assert.equal((await status(privateAsset, 200, first)).headers.get('cache-control'), 'no-store')
  assert.match(await (await status('/', 200, first)).text(), favicon)
  assert.match(await (await status('/announcements', 200, second)).text(), favicon)
  assert.match(await (await status('/menu', 200, second)).text(), favicon)
  assert.match(await (await status('/ledger', 200, second)).text(), favicon)
  assert.equal((await status('/api/sessions/current', 200, second).then((r) => r.json()) as { username: string }).username, 'test-two')

  const collection = '/api/announcements'
  const add = (text: string) => request(collection, 'POST', first, { text })
  const items = () => status(collection, 200, second).then((r) => r.json()) as Promise<{ id: number; text: string }[]>
  const recent = () => status(collection + '?view=recent', 200, second).then((r) => r.json()) as ReturnType<typeof items>
  assert.deepEqual(await recent(), [])
  assert.equal((await request(collection, 'POST', first, { text: '跨站寫入' }, 'https://example.com')).status, 403)
  assert.equal((await add(' \n ')).status, 400)
  const announcementWithSql = "第一行\n'); DROP TABLE announcements; --"
  const created = await add(announcementWithSql)
  assert.equal(created.status, 201)
  const firstItem = created.headers.get('location')!
  assert.equal((await add('另一則公告')).status, 201)
  const initialItems = await items()
  assert.deepEqual(initialItems.map(({ text }) => text), ['另一則公告', announcementWithSql])
  const original = initialItems.map(({ id }) => id)
  const reversed = [...original].reverse()
  assert.equal((await request(firstItem, 'PATCH', second, { text: '修改後\n保留換行' })).status, 200)
  assert.equal((await status(firstItem, 200, first).then((r) => r.json()) as { text: string }).text, '修改後\n保留換行')
  assert.deepEqual((await recent()).map(({ id }) => id), original)
  assert.equal((await request(collection + '/order', 'PUT', first, { ids: reversed, previousIds: original })).status, 204)
  assert.deepEqual((await items()).map(({ id }) => id), reversed)
  assert.equal((await request(collection + '/order', 'PUT', second, { ids: original, previousIds: original })).status, 409)
  assert.equal((await request(firstItem, 'DELETE', second)).status, 204)
  await status(firstItem, 404, first)
  assert.equal((await items()).length, 1)

  assert.equal((await add('並行排序測試一')).status, 201)
  assert.equal((await add('並行排序測試二')).status, 201)
  const [a, b, c] = (await items()).map(({ id }) => id)
  const previousIds = [a, b, c]
  const orders = [[b, a, c], [a, c, b]]
  const reordered = await Promise.all(orders.map((ids, index) =>
    request(collection + '/order', 'PUT', index === 0 ? first : second, { ids, previousIds })))
  assert.deepEqual(reordered.map(({ status }) => status).sort(), [204, 409])
  const savedOrder = orders[reordered.findIndex(({ status }) => status === 204)]
  assert.deepEqual((await items()).map(({ id }) => id), savedOrder)
  assert.equal((await add('新公告放在最上方')).status, 201)
  const latest = await items()
  assert.equal(latest[0]?.text, '新公告放在最上方')
  assert.deepEqual(latest.slice(1).map(({ id }) => id), savedOrder)

  assert.equal((await add('首頁排序測試一')).status, 201)
  assert.equal((await add('首頁排序測試二')).status, 201)
  const beforeMove = (await items()).map(({ id }) => id)
  assert.equal(beforeMove.length, 6)
  const [firstId, secondId, ...rest] = beforeMove
  const afterMove = [secondId, firstId, ...rest]
  assert.equal((await request(collection + '/order', 'PUT', second, { ids: afterMove, previousIds: beforeMove })).status, 204)
  assert.deepEqual((await recent()).map(({ id }) => id), afterMove.slice(0, 5))

  for (let count = afterMove.length; count < MAX_ANNOUNCEMENTS - 1; count++) {
    assert.equal((await add('容量測試')).status, 201)
  }
  const added = await Promise.all([
    add('最後一個位置'),
    request(collection, 'POST', second, { text: '同時新增' }),
  ])
  assert.deepEqual(added.map(({ status }) => status).sort(), [201, 409])
  const allAnnouncements = await items()
  assert.equal(allAnnouncements.length, MAX_ANNOUNCEMENTS)
  assert.deepEqual(await recent(), allAnnouncements.slice(0, 5))

  const expenses = '/api/transactions'
  const newExpense = { item: '早餐', amountCents: 4567, occurredAt: '2026-12-31T15:59:59.999Z' }
  assert.equal((await request(expenses, 'POST', first, newExpense, 'https://example.com')).status, 403)
  assert.equal((await request(expenses, 'POST', first, { ...newExpense, occurredAt: '2027-02-30T00:00:00Z' })).status, 400)
  assert.equal((await request(expenses, 'POST', first, { ...newExpense, amountCents: 0.1 })).status, 400)
  await status(expenses + '?month=2026-13', 400, second)
  const entry = await request(expenses, 'POST', first, newExpense)
  assert.equal(entry.status, 201)
  const expensePath = entry.headers.get('location')!
  const expensePage = async (month: string, pagination = '') =>
    (await status(expenses + '?month=' + month + pagination, 200, second)).json() as Promise<TransactionPage>
  const records = async (month: string) => (await expensePage(month)).data
  const totals = async (year: string) =>
    (await status(expenses + '/summary?year=' + year, 200, second)).json() as Promise<YearSummary>
  assert.deepEqual(await (await status(expensePath, 200, second)).json(), (await records('2026-12'))[0])
  assert.deepEqual((await totals('2026')).months[11], { month: '2026-12', count: 1, amountCents: 4567 })

  const oldExpense = { item: ' 超市 ', amountCents: 12345, occurredAt: '2027-01-01T00:00:00+08:00', legacyId: 'lineboxy:42' }
  const imports = await Promise.all([first, second].map((cookie) => request(expenses, 'POST', cookie, oldExpense)))
  assert.deepEqual(imports.map(({ status }) => status).sort(), [200, 201])
  const importedPath = imports[0]!.headers.get('location')!
  assert.equal(imports[1]!.headers.get('location'), importedPath)
  assert.deepEqual(await records('2027-01'), [{
    ...oldExpense, id: Number(importedPath.split('/').at(-1)), occurredAt: '2026-12-31T16:00:00.000Z',
  }])
  assert.equal((await request(expensePath, 'PATCH', second, { occurredAt: '2026-12-31T16:00:00Z' })).status, 200)
  assert.equal((await totals('2026')).amountCents, 0)
  const annual = await totals('2027')
  assert.equal(annual.amountCents, 16912)
  assert.equal(annual.count, 2)
  assert.equal(annual.months.length, 12)
  assert.equal((await request(importedPath, 'PATCH', second, { amountCents: 100 })).status, 200)
  assert.equal((await request(expenses, 'POST', first, oldExpense)).status, 200)
  assert.equal((await totals('2027')).amountCents, 4667)
  assert.equal((await request(importedPath, 'DELETE', second)).status, 204)
  assert.equal((await request(expenses, 'POST', first, oldExpense)).status, 409)
  assert.equal((await request(expensePath, 'DELETE', second)).status, 204)
  await status(expensePath, 404, first)
  assert.equal((await totals('2027')).count, 0)

  const pageMonth = '2027-02'
  const ids = []
  for (let index = 1; index <= 11; index++) {
    const added = await request(expenses, 'POST', first, {
      item: '分頁測試 ' + index, amountCents: index * 100, occurredAt: '2027-02-01T00:00:00+08:00',
    })
    assert.equal(added.status, 201)
    ids.unshift(Number(added.headers.get('location')?.split('/').at(-1)))
  }
  const firstPage = await expensePage(pageMonth)
  const lastPage = await expensePage(pageMonth, '&offset=10&limit=10')
  assert.deepEqual(firstPage.data.map(({ id }) => id), ids.slice(0, 10))
  assert.deepEqual(lastPage.data.map(({ id }) => id), ids.slice(10))
  assert.equal(firstPage.total, 11)
  assert.equal(lastPage.total, 11)
  assert.equal(firstPage.amountCents, 6600)
  assert.equal(lastPage.amountCents, 6600)
  assert.deepEqual((await expensePage(pageMonth, '&offset=1&limit=2')).data.map(({ id }) => id), ids.slice(1, 3))
  assert.deepEqual(await expensePage(pageMonth, '&offset=20'), { data: [], total: 11, amountCents: 6600 })
  await status(expenses + '?month=' + pageMonth + '&offset=-1', 400, first)
  await status(expenses + '?month=' + pageMonth + '&limit=101', 400, first)
  assert.equal((await request(expenses + '/' + ids.at(-1), 'DELETE', second)).status, 204)
  assert.deepEqual(await expensePage(pageMonth, '&offset=10'), { data: [], total: 10, amountCents: 6500 })

  assert.equal((await request('/api/sessions/current', 'DELETE', first)).status, 204)
  await status(collection, 401, first)
  await status(collection, 200, second)

  for (let attempt = 0; attempt < 7; attempt++) {
    assert.equal((await login('test-one', 'wrong password')).status, 401)
  }
  const throttled = await login('test-one', 'wrong password')
  assert.equal(throttled.status, 429)
  assert.equal(throttled.headers.get('retry-after'), '60')
})
