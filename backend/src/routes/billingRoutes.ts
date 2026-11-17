import { Router } from 'express'
import {
  createTransaction,
  listTransactions,
  transactionDetails,
} from '../controllers/billingController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireTenant } from '../middleware/tenantMiddleware.js'

const billingRoutes = Router()

billingRoutes.use(requireAuth, requireTenant)
billingRoutes.get('/transactions', listTransactions)
billingRoutes.get('/transactions/:transactionId', transactionDetails)
billingRoutes.post('/transactions', createTransaction)

export default billingRoutes
