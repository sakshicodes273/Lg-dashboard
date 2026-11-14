import { getRedisClient } from '../config/redis.js'

export async function checkRedisHealth(): Promise<void> {
  await getRedisClient().ping()
}

export async function getRedisValue(key: string): Promise<string | null> {
  return getRedisClient().get(key)
}

export async function setRedisValue(
  key: string,
  value: string,
  expirationSeconds?: number,
): Promise<void> {
  if (
    expirationSeconds !== undefined &&
    (!Number.isInteger(expirationSeconds) || expirationSeconds <= 0)
  ) {
    throw new RangeError('expirationSeconds must be a positive integer')
  }

  if (expirationSeconds === undefined) {
    await getRedisClient().set(key, value)
  } else {
    await getRedisClient().set(key, value, { EX: expirationSeconds })
  }
}
