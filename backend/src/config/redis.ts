import { createClient } from 'redis'
import type { RedisClientType } from 'redis'

let client: RedisClientType | undefined

export function getRedisUrl(): string {
  const url = process.env.REDIS_URL
  if (!url) throw new Error('REDIS_URL is required')
  return url
}

export function getRedisClient(): RedisClientType {
  if (!client) {
    client = createClient({ url: getRedisUrl() })
    client.on('error', (error) => console.error('Redis connection error:', error))
    client.on('ready', () => console.info('Connected to Redis'))
    client.on('reconnecting', () => console.info('Reconnecting to Redis'))
    client.on('end', () => console.error('Redis connection closed'))
  }
  return client
}

export async function connectRedis(): Promise<void> {
  const redis = getRedisClient()
  if (!redis.isOpen) await redis.connect()
}

export async function closeRedis(): Promise<void> {
  if (client?.isOpen) await client.quit()
}
