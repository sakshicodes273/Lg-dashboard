import type { Response } from 'express'
import type { TenantRequest } from '../middleware/tenantMiddleware.js'
import type { BillingTransactionStatus } from '../models/BillingTransaction.js'
import {
  BillingLockUnavailableError,
  createBillingTransaction,
  getBillingTransaction,
  InvalidBillingRequestError,
  listBillingTransactions,
} from '../services/billingService.js'

const transactionStatuses: BillingTransactionStatus[] = ['pending', 'successful', 'failed']
const allowedListParameters = new Set(['status', 'page', 'limit', 'startDate', 'endDate'])
const transactionIdPattern = /^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i

function isBillingStatus(value: unknown): value is BillingTransactionStatus {
  return typeof value === 'string' && transactionStatuses.some((status) => status === value)
}

function parseDateParameter(value: unknown, parameterName: string): Date | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidBillingRequestError(`${parameterName} must be a date in YYYY-MM-DD format`)
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new InvalidBillingRequestError(`${parameterName} must be a valid calendar date`)
  }
  return date
}

function parsePositiveInteger(value: unknown, name: string, defaultValue: number, maximum: number): number {
  if (value === undefined) return defaultValue
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new InvalidBillingRequestError(`${name} must be a positive whole number`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new InvalidBillingRequestError(`${name} must not exceed ${maximum}`)
  }
  return parsed
}

export async function listTransactions(req: TenantRequest, res: Response): Promise<void> {
  if (!req.tenantConnection || !req.auth?.organizationId) {
    res.status(503).json({ message: 'Organization database is unavailable' })
    return
  }

  try {
    const query = req.query
    const unknownParameters = Object.keys(query).filter((key) => !allowedListParameters.has(key))
    if (unknownParameters.length > 0) {
      throw new InvalidBillingRequestError(`Unsupported query parameter: ${unknownParameters[0]}`)
    }

    const status = query.status
    if (status !== undefined && !isBillingStatus(status)) {
      throw new InvalidBillingRequestError('Status must be pending, successful, or failed')
    }

    const startDate = parseDateParameter(query.startDate, 'startDate')
    const endDate = parseDateParameter(query.endDate, 'endDate')
    if (startDate && endDate && startDate > endDate) {
      throw new InvalidBillingRequestError('startDate must be on or before endDate')
    }

    const result = await listBillingTransactions(req.tenantConnection, {
      organizationId: req.auth.organizationId,
      ...(status ? { status } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate: new Date(endDate.getTime() + 24 * 60 * 60 * 1000) } : {}),
      page: parsePositiveInteger(query.page, 'page', 1, 1_000_000),
      limit: parsePositiveInteger(query.limit, 'limit', 20, 100),
    })
    res.json(result)
  } catch (error) {
    if (error instanceof InvalidBillingRequestError) {
      res.status(400).json({ message: error.message })
      return
    }
    throw error
  }
}

export async function transactionDetails(req: TenantRequest, res: Response): Promise<void> {
  if (!req.tenantConnection || !req.auth?.organizationId) {
    res.status(503).json({ message: 'Organization database is unavailable' })
    return
  }
  const transactionId = req.params.transactionId
  if (typeof transactionId !== 'string' || !transactionIdPattern.test(transactionId)) {
    res.status(400).json({ message: 'Transaction ID must be a valid UUID' })
    return
  }

  const transaction = await getBillingTransaction(
    req.tenantConnection,
    req.auth.organizationId,
    transactionId,
  )
  if (!transaction) {
    res.status(404).json({ message: 'Transaction was not found' })
    return
  }
  res.json({ transaction })
}

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
