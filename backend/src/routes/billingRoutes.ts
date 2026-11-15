import { Router } from 'express'
import { createTransaction } from '../controllers/billingController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireTenant } from '../middleware/tenantMiddleware.js'

const billingRoutes = Router()

billingRoutes.use(requireAuth, requireTenant)
billingRoutes.post('/transactions', createTransaction)

export default billingRoutes
