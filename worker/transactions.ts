import { and, between, count, desc, eq, sum } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { MAX_PRICE, taipeiDate, TRANSACTIONS_PER_PAGE, type TransactionPage, type YearSummary } from '../shared/ledger.ts'
import { jsonObject, type WorkerEnv } from './http.ts'
import { transactionTable as table } from './schema.ts'

export const transactions = new Hono<WorkerEnv>()
const yearPattern = /^[1-9]\d{3}$/
const monthPattern = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/
const timestampPattern = /^[1-9]\d{3}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/
const itemPath = '/:id{[1-9][0-9]*}'
const active = eq(table.deleted, false)
const fields = {
  id: table.id,
  name: table.name,
  price: table.price,
  occurredAt: table.occurredAt,
}

function byId(id: string) {
  const number = Number(id)
  return and(active, eq(table.id, Number.isSafeInteger(number) ? number : 0))
}

function transactionTime(value: unknown) {
  if (typeof value !== 'string' || !timestampPattern.test(value)) return
  const day = value.slice(0, 10)
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || new Date(day).toISOString().slice(0, 10) !== day) return
  const occurredAt = date.toISOString()
  const taipeiMonth = taipeiDate(date).slice(0, 7)
  if (!yearPattern.test(occurredAt.slice(0, 4)) || !monthPattern.test(taipeiMonth)) return
  return { occurredAt, taipeiMonth }
}

function readPrice(value: string | null | undefined) {
  return Number(Number(value ?? 0).toFixed(2))
}

function transactionValues(input: Record<string, unknown>, partial = false) {
  if (Object.keys(input).some((key) => !['name', 'price', 'occurredAt'].includes(key))) return
  const { name, price, occurredAt } = input
  const values: Partial<Pick<typeof table.$inferInsert, 'name' | 'price' | 'occurredAt' | 'taipeiMonth'>> = {}
  if (!partial || 'name' in input) {
    if (typeof name !== 'string' || !name.trim() || name.includes('\0') || name.length > 500) return
    values.name = name
  }
  if (!partial || 'price' in input) {
    if (typeof price !== 'number' || !Number.isFinite(price) ||
      price < 0.01 || price > MAX_PRICE || Number(price.toFixed(2)) !== price) return
    values.price = price
  }
  if (!partial || 'occurredAt' in input) {
    const time = transactionTime(occurredAt)
    if (!time) return
    Object.assign(values, time)
  }
  return values
}

transactions.get('/', async (c) => {
  const month = c.req.query('month') ?? taipeiDate(new Date()).slice(0, 7)
  if (!monthPattern.test(month)) return c.json({ error: '請輸入 YYYY-MM 格式的月份。' }, 400)

  const offsetInput = c.req.query('offset') ?? '0'
  const limitInput = c.req.query('limit') ?? String(TRANSACTIONS_PER_PAGE)
  const offset = Number(offsetInput)
  const limit = Number(limitInput)
  if (!/^\d+$/.test(offsetInput) || !Number.isSafeInteger(offset) ||
    !/^\d+$/.test(limitInput) || limit < 1 || limit > 100) {
    return c.json({ error: '分頁起始位置須為非負整數，每頁須為 1 到 100 筆。' }, 400)
  }

  const db = drizzle(c.env.DB)
  const inMonth = and(active, eq(table.taipeiMonth, month))
  const [data, [totals]] = await db.batch([
    db.select(fields).from(table).where(inMonth)
      .orderBy(desc(table.occurredAt), desc(table.id)).limit(limit).offset(offset),
    db.select({ total: count(), price: sum(table.price) }).from(table).where(inMonth),
  ])
  const page: TransactionPage = { data, total: totals?.total ?? 0, price: readPrice(totals?.price) }
  return c.json(page)
})

transactions.get('/summary', async (c) => {
  const year = c.req.query('year') ?? taipeiDate(new Date()).slice(0, 4)
  if (!yearPattern.test(year)) return c.json({ error: '請輸入四位數年份。' }, 400)

  const rows = await drizzle(c.env.DB).select({
    month: table.taipeiMonth,
    count: count(),
    price: sum(table.price),
  }).from(table).where(and(active, between(table.taipeiMonth, year + '-01', year + '-12')))
    .groupBy(table.taipeiMonth)
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = year + '-' + String(index + 1).padStart(2, '0')
    const row = rows.find((entry) => entry.month === month)
    return { month, count: row?.count ?? 0, price: readPrice(row?.price) }
  })
  const summary: YearSummary = {
    year,
    months,
    count: months.reduce((total, month) => total + month.count, 0),
    price: Number(months.reduce((total, month) => total + month.price, 0).toFixed(2)),
  }
  return c.json(summary)
})

transactions.get('/years', async (c) => {
  const months = await drizzle(c.env.DB).selectDistinct({ month: table.taipeiMonth }).from(table)
    .where(active).orderBy(desc(table.taipeiMonth))
  return c.json([...new Set(months.map(({ month }) => month.slice(0, 4)))])
})

transactions.post('/', async (c) => {
  const input = await jsonObject(c)
  const values = transactionValues(input)
  if (values?.name === undefined || values.price === undefined ||
    values.occurredAt === undefined || values.taipeiMonth === undefined) {
    return c.json({ error: '請確認品項、金額與交易時間的格式。' }, 400)
  }

  const created = await drizzle(c.env.DB).insert(table).values({
    name: values.name,
    price: values.price,
    occurredAt: values.occurredAt,
    taipeiMonth: values.taipeiMonth,
  }).returning(fields).get()
  if (!created) throw new Error('Transaction insert returned no row')
  c.header('Location', '/api/transactions/' + created.id)
  return c.json(created, 201)
})

transactions.get(itemPath, async (c) => {
  const item = await drizzle(c.env.DB).select(fields).from(table).where(byId(c.req.param('id'))).get()
  return item ? c.json(item) : c.json({ error: '找不到這筆支出。' }, 404)
})

transactions.patch(itemPath, async (c) => {
  const input = await jsonObject(c)
  const values = transactionValues(input, true)
  if (!values || !Object.keys(values).length) {
    return c.json({ error: '請提供有效的品項、金額或交易時間。' }, 400)
  }

  const item = await drizzle(c.env.DB).update(table).set(values)
    .where(byId(c.req.param('id'))).returning(fields).get()
  return item ? c.json(item) : c.json({ error: '找不到這筆支出。' }, 404)
})

transactions.delete(itemPath, async (c) => {
  const { meta } = await drizzle(c.env.DB).delete(table).where(byId(c.req.param('id'))).run()
  return meta.changes
    ? c.body(null, 204)
    : c.json({ error: '找不到這筆支出。' }, 404)
})
