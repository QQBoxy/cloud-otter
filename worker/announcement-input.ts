export const MAX_ANNOUNCEMENTS = 200
export const MAX_TEXT = 500

export function announcementText(value: unknown) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 && text.length <= MAX_TEXT && !text.includes('\0') ? text : null
}

export function orderInput(ids: unknown, previousIds: unknown) {
  const valid = (value: unknown): value is number[] =>
    Array.isArray(value) && value.length > 0 && value.length <= MAX_ANNOUNCEMENTS &&
    value.every((id) => Number.isSafeInteger(id) && id > 0) && new Set(value).size === value.length

  if (!valid(ids) || !valid(previousIds) || ids.length !== previousIds.length ||
    !ids.every((id) => previousIds.includes(id))) return null
  return { ids, previousIds }
}
