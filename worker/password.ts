import { Buffer } from 'node:buffer'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
const options = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 ** 2 }

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 32, options, (error, hash) => {
      if (error) reject(error)
      else resolve(hash)
    })
  })
}

export const passwordRecord = /^[0-9a-f]{32}:[0-9a-f]{64}$/

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = await derive(password, salt)
  return salt.toString('hex') + ':' + hash.toString('hex')
}

export async function verifyPassword(password: string, record: string) {
  if (!passwordRecord.test(record)) return false
  const [salt, expected] = record.split(':')
  const actual = await derive(password, Buffer.from(salt, 'hex'))
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'))
}
