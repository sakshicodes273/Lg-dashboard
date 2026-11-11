import { Router } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.js'

const dashboardRoutes = Router()

dashboardRoutes.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({
    organizationId: req.auth?.organizationId,
    metrics: {
      totalUsage: { value: '2.84 TB', change: '+12.8%' },
      monthlySpend: { value: '$12,840', change: '+4.2%' },
      activeResources: { value: '128', change: '+8 this month' },
      utilization: { value: '76%', change: 'Within target' },
    },
  })
})

export default dashboardRoutes