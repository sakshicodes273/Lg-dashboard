import type { Response } from 'express'
import type { TenantRequest } from '../middleware/tenantMiddleware.js'
import {
  BillingLockUnavailableError,
  createBillingTransaction,
  InvalidBillingRequestError,
} from '../services/billingService.js'

export async function createTransaction(req: TenantRequest, res: Response): Promise<void> {
  if (!req.tenantConnection || !req.auth?.organizationId) {
    res.status(503).json({ message: 'Organization database is unavailable' })
    return
  }

  const body: unknown = req.body
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    res.status(400).json({ message: 'A JSON transaction object is required' })
    return
  }

  const input = body as Record<string, unknown>
  if (input.description !== undefined && typeof input.description !== 'string') {
    res.status(400).json({ message: 'Description must be a string' })
    return
  }

  const idempotencyKey = typeof input.idempotencyKey === 'string'
    ? input.idempotencyKey.trim()
    : ''
  const amount = typeof input.amount === 'number' ? input.amount : Number.NaN
  const currency = typeof input.currency === 'string' ? input.currency.trim() : ''
  const description = typeof input.description === 'string' ? input.description : ''

  try {
    const result = await createBillingTransaction(req.tenantConnection, {
      idempotencyKey,
      organizationId: req.auth.organizationId,
      amount,
      currency,
      description,
    })
    res.status(result.replayed ? 200 : 201).json({
      transaction: result.transaction,
      replayed: result.replayed,
    })
  } catch (error) {
    if (error instanceof InvalidBillingRequestError) {
      res.status(400).json({ message: error.message })
      return
    }
    if (error instanceof BillingLockUnavailableError) {
      res.setHeader('Retry-After', '1')
      res.status(503).json({ message: error.message })
      return
    }
    throw error
  }
}
