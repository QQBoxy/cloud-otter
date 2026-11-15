import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const sessionTable = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  username: text().notNull(),
  expiresAt: integer('expires_at').notNull(),
}, (table) => [index('sessions_expiry').on(table.expiresAt)])

export const loginLimitTable = sqliteTable('login_limits', {
  account: integer().primaryKey(),
  window: integer().notNull(),
  attempts: integer().notNull(),
})

export const announcementTable = sqliteTable('announcements', {
  id: integer().primaryKey({ autoIncrement: true }),
  text: text().notNull(),
  position: integer().notNull(),
})

export const announcementRevisionTable = sqliteTable('announcement_revision', {
  id: integer().primaryKey(),
  revision: text().notNull(),
  orderedIds: text('ordered_ids', { mode: 'json' }).$type<number[]>().notNull(),
})

export const transactionTable = sqliteTable('transactions', {
  id: integer().primaryKey({ autoIncrement: true }),
  item: text().notNull(),
  amountCents: integer('amount_cents').notNull(),
  occurredAt: text('occurred_at').notNull(),
  taipeiMonth: text('taipei_month').notNull(),
  legacyId: text('legacy_id').unique(),
  deleted: integer({ mode: 'boolean' }).notNull().default(false),
}, (table) => [index('transactions_month').on(table.deleted, table.taipeiMonth, table.occurredAt, table.id)])
