import { and, between, count, desc, eq, isNotNull, isNull, sum } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { MAX_AMOUNT_CENTS, taipeiDate, TRANSACTIONS_PER_PAGE, type TransactionPage, type YearSummary } from '../shared/ledger.ts'
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
  item: table.item,
  amountCents: table.amountCents,
  occurredAt: table.occurredAt,
  legacyId: table.legacyId,
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

function transactionValues(input: Record<string, unknown>, partial = false) {
  const { item, amountCents, occurredAt } = input
  const values: Partial<Pick<typeof table.$inferInsert, 'item' | 'amountCents' | 'occurredAt' | 'taipeiMonth'>> = {}
  if (!partial || 'item' in input) {
    if (typeof item !== 'string' || !item.trim() || item.includes('\0') || item.length > 500) return
    values.item = item
  }
  if (!partial || 'amountCents' in input) {
    if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) ||
      amountCents < 1 || amountCents > MAX_AMOUNT_CENTS) return
    values.amountCents = amountCents
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
    db.select({ total: count(), amountCents: sum(table.amountCents) }).from(table).where(inMonth),
  ])
  const page: TransactionPage = { data, total: totals?.total ?? 0, amountCents: Number(totals?.amountCents ?? 0) }
  return c.json(page)
})

transactions.get('/summary', async (c) => {
  const year = c.req.query('year') ?? taipeiDate(new Date()).slice(0, 4)
  if (!yearPattern.test(year)) return c.json({ error: '請輸入四位數年份。' }, 400)

  const rows = await drizzle(c.env.DB).select({
    month: table.taipeiMonth,
    count: count(),
    amountCents: sum(table.amountCents),
  }).from(table).where(and(active, between(table.taipeiMonth, year + '-01', year + '-12')))
    .groupBy(table.taipeiMonth)
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = year + '-' + String(index + 1).padStart(2, '0')
    const row = rows.find((entry) => entry.month === month)
    return { month, count: row?.count ?? 0, amountCents: Number(row?.amountCents ?? 0) }
  })
  const summary: YearSummary = {
    year,
    months,
    count: months.reduce((total, month) => total + month.count, 0),
    amountCents: months.reduce((total, month) => total + month.amountCents, 0),
  }
  return c.json(summary)
})

transactions.post('/', async (c) => {
  const input = await jsonObject(c)
  const values = transactionValues(input)
  const { legacyId } = input
  if (values?.item === undefined || values.amountCents === undefined ||
    values.occurredAt === undefined || values.taipeiMonth === undefined ||
    (legacyId !== undefined && (typeof legacyId !== 'string' || !legacyId.trim() || legacyId.length > 256))) {
    return c.json({ error: '請確認品項、金額、交易時間與舊交易識別碼的格式。' }, 400)
  }

  const db = drizzle(c.env.DB)
  const created = await db.insert(table).values({
    item: values.item,
    amountCents: values.amountCents,
    occurredAt: values.occurredAt,
    taipeiMonth: values.taipeiMonth,
    legacyId,
  }).onConflictDoNothing({ target: table.legacyId }).returning(fields).get()
  if (created) {
    c.header('Location', '/api/transactions/' + created.id)
    return c.json(created, 201)
  }

  if (typeof legacyId !== 'string') throw new Error('Transaction insert returned no row')
  const existing = await db.select(fields).from(table).where(and(active, eq(table.legacyId, legacyId))).get()
  if (!existing) return c.json({ error: '這筆舊交易已匯入並刪除。' }, 409)
  c.header('Location', '/api/transactions/' + existing.id)
  return c.json(existing)
})

transactions.get(itemPath, async (c) => {
  const item = await drizzle(c.env.DB).select(fields).from(table).where(byId(c.req.param('id'))).get()
  return item ? c.json(item) : c.json({ error: '找不到這筆支出。' }, 404)
})

transactions.patch(itemPath, async (c) => {
  const input = await jsonObject(c)
  const values = transactionValues(input, true)
  if (!values || !Object.keys(values).length || 'legacyId' in input) {
    return c.json({ error: '請提供有效的品項、金額或交易時間。' }, 400)
  }

  const item = await drizzle(c.env.DB).update(table).set(values)
    .where(byId(c.req.param('id'))).returning(fields).get()
  return item ? c.json(item) : c.json({ error: '找不到這筆支出。' }, 404)
})

transactions.delete(itemPath, async (c) => {
  const db = drizzle(c.env.DB)
  const item = byId(c.req.param('id'))
  const [removed, marked] = await db.batch([
    db.delete(table).where(and(item, isNull(table.legacyId))),
    // Reserve imported IDs so rerunning a source import cannot restore deleted items.
    db.update(table).set({ deleted: true, item: '已刪除', amountCents: 1, occurredAt: '', taipeiMonth: '' })
      .where(and(item, isNotNull(table.legacyId))),
  ])
  return removed.meta.changes || marked.meta.changes
    ? c.body(null, 204)
    : c.json({ error: '找不到這筆支出。' }, 404)
})
