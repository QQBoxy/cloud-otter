import { request } from './request'

export type Announcement = { id: number; text: string }
export const collection = '/api/announcements'

function isAnnouncement(value: unknown): value is Announcement {
  return value !== null && typeof value === 'object' &&
    'id' in value && typeof value.id === 'number' &&
    'text' in value && typeof value.text === 'string'
}

export async function readAnnouncements(query = '') {
  const response = await request(collection + query)
  const items: unknown = await response.json()
  if (!Array.isArray(items) || !items.every(isAnnouncement)) {
    throw new Error('公告資料格式不正確。')
  }
  return items
}
