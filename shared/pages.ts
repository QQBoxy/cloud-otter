export const transactionPage = { path: '/transaction', label: '記帳' } as const
export const transactionTotalPage = { path: '/transaction/total', label: '年度統計' } as const
export const legacyLedgerPath = '/ledger'

export const features = [
  { path: '/announcements', label: '公告' },
  transactionPage,
] as const

export const menu = { path: '/menu', label: '功能表' } as const
export const board = { path: '/', label: 'Board' } as const
export const navigation = [...features, menu]
export const pages = [board, ...navigation, transactionTotalPage]
