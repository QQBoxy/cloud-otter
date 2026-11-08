import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { MAX_ANNOUNCEMENTS } from '../worker/announcement-input.ts'
import { hashPassword } from '../worker/password.ts'

const run = promisify(execFile)
const wrangler = resolve('node_modules/.bin/wrangler')
const environment = {
  ...process.env,
  WRANGLER_SEND_METRICS: 'false',
  X_LOCAL_EXPLORER: 'false',
  CI: 'true',
}
const testPassword = 'test-only announcement password'
const sessionKey = 'ab'.repeat(32)

test('Worker protects assets and two administrators share the same D1 announcements', { timeout: 60_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cloud-otter-test-'))
  const envFile = join(directory, 'test.env')
  const state = join(directory, 'state')
  t.after(() => rm(directory, { recursive: true, force: true }))

  const [firstHash, secondHash] = await Promise.all([hashPassword(testPassword), hashPassword(testPassword)])
  await writeFile(envFile, [
    'ADMIN_1_USERNAME=test-one',
    'ADMIN_1_PASSWORD_HASH=' + firstHash,
    'ADMIN_2_USERNAME=test-two',
    'ADMIN_2_PASSWORD_HASH=' + secondHash,
    'SESSION_KEY=' + sessionKey,
  ].join('\n'), { mode: 0o600 })

  const wranglerOptions = { env: { ...environment, WRANGLER_LOG_PATH: join(directory, 'wrangler.log') } }
  await run(wrangler, ['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state], wranglerOptions)
  const expiredToken = '00'.repeat(32)
  const expiredHash = createHmac('sha256', Buffer.from(sessionKey, 'hex')).update(expiredToken).digest('hex')
  await run(wrangler, ['d1', 'execute', 'DB', '--local', '--persist-to', state, '--command',
    `INSERT INTO sessions VALUES ('${expiredHash}', 'test-one', 1)`,
  ], wranglerOptions)

  const worker = spawn(wrangler, [
    'dev', '--local', '--ip', '127.0.0.1', '--port', '0', '--inspector-port', '0',
    '--persist-to', state, '--env-file', envFile, '--show-interactive-dev-session=false',
  ], { ...wranglerOptions, stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = once(worker, 'exit')
  let output = ''
  const origin = await new Promise<string>((done, fail) => {
    const timer = setTimeout(() => fail(new Error('Worker 未啟動\n' + output)), 15_000)
    const collect = (chunk: Buffer) => {
      output += chunk.toString()
      const address = output.match(/Ready on (http:\/\/127\.0\.0\.1:\d+)/)?.[1]
      if (address) {
        clearTimeout(timer)
        done(address)
      }
    }
    worker.stdout.on('data', collect)
    worker.stderr.on('data', collect)
    worker.once('exit', () => {
      clearTimeout(timer)
      fail(new Error('Worker 提早結束\n' + output))
    })
    t.after(async () => {
      clearTimeout(timer)
      if (worker.exitCode === null && worker.signalCode === null) worker.kill()
      await exited
    })
  })

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
  const page = await status('/login', 200)
  const publicAsset = (await page.text()).match(/src="(\/login-assets\/[^"]+)"/)?.[1]
  assert.ok(publicAsset)
  await status(publicAsset, 200)
  await status('/api/health', 200)
  await status('/api/announcements', 401)
  const explorer = await request('/cdn-cgi/local/explorer/api/d1/database')
  assert.ok([401, 404].includes(explorer.status), 'local D1 explorer must be inaccessible')
  await status('/index.html', 401)
  await status('/api/sessions/current', 401, '__Host-session=' + expiredToken)

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
  const first = setCookie.split(';')[0]
  const second = secondLogin.headers.get('set-cookie')!.split(';')[0]
  assert.equal((await status(privateAsset, 200, first)).headers.get('cache-control'), 'no-store')
  await status('/', 200, first)
  assert.equal((await status('/api/sessions/current', 200, second).then((r) => r.json()) as { username: string }).username, 'test-two')

  const collection = '/api/announcements'
  const add = (text: string) => request(collection, 'POST', first, { text })
  const items = () => status(collection, 200, second).then((r) => r.json()) as Promise<{ id: number; text: string }[]>
  assert.equal((await request(collection, 'POST', first, { text: '跨站寫入' }, 'https://example.com')).status, 403)
  assert.equal((await add(' \n ')).status, 400)
  const announcementWithSql = "第一行\n'); DROP TABLE announcements; --"
  const created = await add(announcementWithSql)
  assert.equal(created.status, 201)
  const firstItem = created.headers.get('location')!
  assert.equal((await add('另一則公告')).status, 201)
  assert.equal((await items())[0]?.text, announcementWithSql)
  const original = (await items()).map(({ id }) => id)
  const reversed = [...original].reverse()
  assert.equal((await request(firstItem, 'PATCH', second, { text: '修改後\n保留換行' })).status, 200)
  assert.equal((await status(firstItem, 200, first).then((r) => r.json()) as { text: string }).text, '修改後\n保留換行')
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
  assert.deepEqual((await items()).map(({ id }) => id), orders[reordered.findIndex(({ status }) => status === 204)])

  for (let count = previousIds.length; count < MAX_ANNOUNCEMENTS - 1; count++) {
    assert.equal((await add('容量測試')).status, 201)
  }
  const added = await Promise.all([
    add('最後一個位置'),
    request(collection, 'POST', second, { text: '同時新增' }),
  ])
  assert.deepEqual(added.map(({ status }) => status).sort(), [201, 409])
  assert.equal((await items()).length, MAX_ANNOUNCEMENTS)

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
