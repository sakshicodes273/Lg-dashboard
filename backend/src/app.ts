import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import authRoutes from './routes/authRoutes.js'
import dashboardRoutes from './routes/dashboardRoutes.js'
import { checkRedisHealth } from './services/redisService.js'

const app = express()

app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '10kb' }))
app.use(cookieParser())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'LedgerGuard Backend Running' })
})
app.get('/api/health/redis', async (_req, res) => {
  try {
    await checkRedisHealth()
    res.json({ status: 'ok' })
  } catch (error) {
    console.error('Redis health check failed:', error)
    res.status(503).json({ status: 'unhealthy' })
  }
})
app.use('/api/auth', authRoutes)
app.use('/api/dashboard', dashboardRoutes)

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Request error:', error)
  res.status(500).json({ message: 'An unexpected error occurred' })
})

export default app