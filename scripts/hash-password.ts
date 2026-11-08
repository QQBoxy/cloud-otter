import { createInterface } from 'node:readline'
import { hashPassword } from '../worker/password.ts'

if (!process.stdin.isTTY) process.exit(1)

const input = createInterface({ input: process.stdin, terminal: true, historySize: 0 })
input.once('close', () => process.stderr.write('\n'))
process.stderr.write('請貼上 16 個字元以上的密碼，按 Enter 確認：')

for await (const password of input) {
  input.close()
  console.log(await hashPassword(password))
  break
}
