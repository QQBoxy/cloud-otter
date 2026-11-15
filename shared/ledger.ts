export type Transaction = {
  id: number
  name: string
  price: number
  occurredAt: string
}

export type MonthTotal = { month: string; count: number; price: number }
export type YearSummary = { year: string; count: number; price: number; months: MonthTotal[] }
export type TransactionPage = { data: Transaction[]; total: number; price: number }

export const MAX_PRICE = 9_999_999_999.99
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
