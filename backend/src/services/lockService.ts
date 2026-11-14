import { randomUUID } from 'node:crypto'
import { getRedisClient } from '../config/redis.js'

const releaseLockScript = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`

export async function acquireLock(lockKey: string, ttlMs: number): Promise<string | null> {
  if (!lockKey.trim()) throw new TypeError('lockKey must not be empty')
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new RangeError('ttlMs must be a positive safe integer')
  }

  const token = randomUUID()
  const result = await getRedisClient().set(lockKey, token, { NX: true, PX: ttlMs })
  return result === 'OK' ? token : null
}

export async function releaseLock(lockKey: string, token: string): Promise<boolean> {
  if (!lockKey.trim()) throw new TypeError('lockKey must not be empty')
  if (!token) throw new TypeError('token must not be empty')

  const result = await getRedisClient().eval(releaseLockScript, {
    keys: [lockKey],
    arguments: [token],
  })
  return result === 1
}
