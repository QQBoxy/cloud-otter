import { MAX_PRICE } from '../shared/ledger.ts'

export const transactionCollection = '/api/transactions'

export function parsePrice(input: string) {
  const value = input.trim()
  const price = Number(value)
  if (!/^\d+(\.\d{1,2})?$/.test(value) || price < 0.01 || price > MAX_PRICE) {
    throw new Error('請輸入大於 0 的金額，最多兩位小數。')
  }
  return price
}
