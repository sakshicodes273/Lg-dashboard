import { Router } from 'express'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireTenant, type TenantRequest } from '../middleware/tenantMiddleware.js'

const dashboardRoutes = Router()

dashboardRoutes.use(requireAuth, requireTenant)

dashboardRoutes.get('/', (req: TenantRequest, res) => {
  if (!req.tenantConnection) {
    res.status(503).json({ message: 'Organization database is unavailable' })
    return
  }

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