export type Transaction = {
  id: number
  item: string
  amountCents: number
  occurredAt: string
  legacyId: string | null
}

export type MonthTotal = { month: string; count: number; amountCents: number }
export type YearSummary = { year: string; count: number; amountCents: number; months: MonthTotal[] }
export type TransactionPage = { data: Transaction[]; total: number; amountCents: number }

export const MAX_AMOUNT_CENTS = 999_999_999_999
export const TRANSACTIONS_PER_PAGE = 10

const calendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function taipeiDate(date: Date) {
  const { year, month, day } = Object.fromEntries(
    calendar.formatToParts(date).map(({ type, value }) => [type, value]),
  )
  return year + '-' + month + '-' + day
}
