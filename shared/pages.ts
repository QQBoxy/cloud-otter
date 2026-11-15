export const features = [
  { path: '/announcements', label: '公告' },
  { path: '/ledger', label: '記帳' },
] as const

export const menu = { path: '/menu', label: '功能表' } as const
export const board = { path: '/', label: 'Board' } as const
export const navigation = [...features, menu]
export const pages = [board, ...navigation]
