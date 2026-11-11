import 'dotenv/config'
import app from './app.js'
import { connectDatabase } from './config/database.js'

const port = Number(process.env.PORT ?? 4000)
const jwtSecret = process.env.JWT_SECRET

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to a secret of at least 32 characters')
}

try {
  await connectDatabase()
  app.listen(port, () => console.info(`LedgerGuard API listening on port ${port}`))
} catch (error) {
  console.error('Unable to start LedgerGuard API:', error)
  process.exit(1)
}