import 'dotenv/config'
import app from './app.js'
import { closeDatabase, connectDatabase } from './config/database.js'
import { closeRedis, connectRedis } from './config/redis.js'
import { getJwtSecret } from './config/security.js'

const port = Number(process.env.PORT ?? 4000)
getJwtSecret()

try {
  await connectDatabase()
  await connectRedis()
  const server = app.listen(port, () => console.info(`LedgerGuard API listening on port ${port}`))
  let shuttingDown = false

  const shutdown = (signal: string): void => {
    if (shuttingDown) return
    shuttingDown = true
    console.info(`Received ${signal}; shutting down LedgerGuard API`)

    server.close(async (error) => {
      if (error) {
        console.error('Unable to close HTTP server cleanly:', error)
        process.exitCode = 1
      }

      const cleanupTasks = [
        ['database', closeDatabase],
        ['Redis', closeRedis],
      ] as const

      for (const [name, cleanup] of cleanupTasks) {
        try {
          await cleanup()
        } catch (cleanupError) {
          console.error(`Unable to close ${name} connections cleanly:`, cleanupError)
          process.exitCode = 1
        }
      }
    })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
} catch (error) {
  console.error('Unable to start LedgerGuard API:', error)
  process.exit(1)
}