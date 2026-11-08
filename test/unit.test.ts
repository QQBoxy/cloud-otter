import assert from 'node:assert/strict'
import test from 'node:test'
import { announcementText, orderInput } from '../worker/announcement-input.ts'
import { hashPassword, verifyPassword } from '../worker/password.ts'

test('announcements preserve internal line breaks and reject invalid input', () => {
  assert.equal(announcementText('  第一行\n第二行  '), '第一行\n第二行')
  for (const invalid of [null, ' \n ', 'a'.repeat(501), 'a\0b']) {
    assert.equal(announcementText(invalid), null)
  }
})

test('reordering requires the same unique IDs before and after', () => {
  assert.deepEqual(orderInput([2, 1], [1, 2]), { ids: [2, 1], previousIds: [1, 2] })
  assert.equal(orderInput([1, 1], [1, 2]), null)
  assert.equal(orderInput([1, 3], [1, 2]), null)
  assert.equal(orderInput(['1'], [1]), null)
})

test('scrypt uses distinct salts and verifies the password', async () => {
  const password = 'test-only password'
  const record = await hashPassword(password)
  assert.notEqual(record, await hashPassword(password))
  assert.equal(await verifyPassword(password, record), true)
  assert.equal(await verifyPassword('wrong password', record), false)
  assert.equal(await verifyPassword(password, 'invalid record'), false)
})
