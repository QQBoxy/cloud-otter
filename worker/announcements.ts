import { and, eq, lt, sql } from 'drizzle-orm'
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { announcementText, MAX_ANNOUNCEMENTS, orderInput } from './announcement-input.ts'
import { jsonObject, type WorkerEnv } from './http.ts'
import { announcementRevisionTable, announcementTable } from './schema.ts'

export const announcements = new Hono<WorkerEnv>()
const itemPath = '/:id{[1-9][0-9]*}'
const fields = { id: announcementTable.id, text: announcementTable.text }
const board = eq(announcementRevisionTable.id, 1)
// New items share the last position and are ordered by their generated ID.
const appendPosition = Number.MAX_SAFE_INTEGER

function byId(id: string) {
  return eq(announcementTable.id, sql.param(id))
}

async function readBoard(db: DrizzleD1Database) {
  const [[snapshot], items] = await db.batch([
    db.select().from(announcementRevisionTable).where(board),
    db.select(fields).from(announcementTable).orderBy(announcementTable.position, announcementTable.id),
  ])
  if (!snapshot) throw new Error('Announcement revision is missing')

  // Keep the existing position order for older data and items added since the last reorder.
  const positions = new Map(snapshot.orderedIds.map((id, position) => [id, position]))
  const rank = (id: number) => positions.get(id) ?? MAX_ANNOUNCEMENTS
  items.sort((first, second) => rank(first.id) - rank(second.id))
  return { snapshot, items }
}

announcements.get('/', async (c) => {
  const { items } = await readBoard(drizzle(c.env.DB))
  return c.json(items)
})

announcements.post('/', async (c) => {
  const text = announcementText((await jsonObject(c)).text)
  if (!text) return c.json({ error: '請輸入 1 到 500 個字元。' }, 400)

  const db = drizzle(c.env.DB)
  // Check capacity inside the insert so concurrent requests cannot exceed the limit.
  const newItem = db.select({
    id: sql.param(null).getSQL().as('id'),
    text: sql.param(text).getSQL().as('text'),
    position: sql.param(appendPosition).getSQL().as('position'),
  }).from(announcementRevisionTable).where(and(board, lt(db.$count(announcementTable), MAX_ANNOUNCEMENTS)))
  const [[item]] = await db.batch([
    db.insert(announcementTable).select(newItem).returning(fields),
    db.update(announcementRevisionTable).set({ revision: crypto.randomUUID() }).where(board),
  ])
  if (!item) return c.json({ error: '公告欄已滿，請先刪除一則公告。' }, 409)
  c.header('Location', '/api/announcements/' + item.id)
  return c.json(item, 201)
})

announcements.get(itemPath, async (c) => {
  const item = await drizzle(c.env.DB).select(fields).from(announcementTable)
    .where(byId(c.req.param('id'))).get()
  return item ? c.json(item) : c.json({ error: '找不到這則公告。' }, 404)
})

announcements.patch(itemPath, async (c) => {
  const text = announcementText((await jsonObject(c)).text)
  if (!text) return c.json({ error: '請輸入 1 到 500 個字元。' }, 400)

  const item = await drizzle(c.env.DB).update(announcementTable).set({ text })
    .where(byId(c.req.param('id'))).returning(fields).get()
  return item ? c.json(item) : c.json({ error: '找不到這則公告。' }, 404)
})

announcements.delete(itemPath, async (c) => {
  const db = drizzle(c.env.DB)
  const [{ meta }] = await db.batch([
    db.delete(announcementTable).where(byId(c.req.param('id'))),
    db.update(announcementRevisionTable).set({ revision: crypto.randomUUID() }).where(board),
  ])
  return meta.changes ? c.body(null, 204) : c.json({ error: '找不到這則公告。' }, 404)
})

announcements.put('/order', async (c) => {
  const { ids, previousIds } = await jsonObject(c)
  const order = orderInput(ids, previousIds)
  if (!order) return c.json({ error: '排序資料不正確。' }, 400)

  const db = drizzle(c.env.DB)
  const { snapshot, items } = await readBoard(db)
  const matches = (ids: number[]) => items.length === ids.length && items.every(({ id }, index) => id === ids[index])
  if (matches(order.ids)) return c.body(null, 204)
  if (!matches(order.previousIds)) return c.json({ error: '公告順序已更新，請再試一次。' }, 409)

  // Compare and update in one statement so a concurrent change cannot overwrite the order.
  const { meta } = await db.update(announcementRevisionTable)
    .set({ revision: crypto.randomUUID(), orderedIds: order.ids })
    .where(and(board, eq(announcementRevisionTable.revision, snapshot.revision))).run()
  return meta.changes ? c.body(null, 204) : c.json({ error: '公告順序已更新，請再試一次。' }, 409)
})
