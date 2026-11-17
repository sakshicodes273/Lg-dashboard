import { createHash, randomUUID } from 'node:crypto'
import type { Connection, HydratedDocument } from 'mongoose'
import { acquireLock, releaseLock } from './lockService.js'
import {
  getBillingTransactionModel,
  type BillingTransactionRecord,
} from '../models/BillingTransaction.js'

const lockTtlMs = 90000
const lockWaitMs = 5000
const lockPollIntervalMs = 50
const transactionMaxCommitTimeMs = 5000

export interface CreateBillingTransactionInput {
  idempotencyKey: string
  organizationId: string
  amount: number
  currency: string
  description: string
}

export interface BillingTransactionResult {
  transaction: HydratedDocument<BillingTransactionRecord>
  replayed: boolean
}

export interface ListBillingTransactionsInput {
  organizationId: string
  status?: BillingTransactionRecord['status']
  startDate?: Date
  endDate?: Date
  page: number
  limit: number
}

export interface BillingTransactionPage {
  transactions: BillingTransactionRecord[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export class InvalidBillingRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidBillingRequestError'
  }
}

export class BillingLockUnavailableError extends Error {
  constructor() {
    super('A transaction with this idempotency key is still being processed')
    this.name = 'BillingLockUnavailableError'
  }
}

export async function listBillingTransactions(
  connection: Connection,
  input: ListBillingTransactionsInput,
): Promise<BillingTransactionPage> {
  const BillingTransaction = getBillingTransactionModel(connection)
  const filter: Record<string, unknown> = { organizationId: input.organizationId }

  if (input.status) filter.status = input.status
  if (input.startDate || input.endDate) {
    filter.createdAt = {
      ...(input.startDate ? { $gte: input.startDate } : {}),
      ...(input.endDate ? { $lt: input.endDate } : {}),
    }
  }

  const [transactions, total] = await Promise.all([
    BillingTransaction.find(filter)
      .sort({ createdAt: -1, transactionId: 1 })
      .skip((input.page - 1) * input.limit)
      .limit(input.limit)
      .lean()
      .exec(),
    BillingTransaction.countDocuments(filter).exec(),
  ])

  return {
    transactions,
    page: input.page,
    limit: input.limit,
    total,
    totalPages: Math.ceil(total / input.limit),
  }
}

export async function getBillingTransaction(
  connection: Connection,
  organizationId: string,
  transactionId: string,
): Promise<BillingTransactionRecord | null> {
  const BillingTransaction = getBillingTransactionModel(connection)
  return BillingTransaction.findOne({ organizationId, transactionId }).lean().exec()
}

function validateInput(input: CreateBillingTransactionInput): void {
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200) {
    throw new InvalidBillingRequestError('Idempotency key must be between 1 and 200 characters')
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new InvalidBillingRequestError('Amount must be a positive number')
  }
  if (!/^[a-zA-Z]{3}$/.test(input.currency)) {
    throw new InvalidBillingRequestError('Currency must be a three-letter code')
  }
  if (input.description.length > 500) {
    throw new InvalidBillingRequestError('Description must be 500 characters or fewer')
  }
}

function duplicateKeyError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 11000
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export async function createBillingTransaction(
  connection: Connection,
  input: CreateBillingTransactionInput,
): Promise<BillingTransactionResult> {
  validateInput(input)

  const BillingTransaction = getBillingTransactionModel(connection)
  await BillingTransaction.init()

  const lookup = {
    organizationId: input.organizationId,
    idempotencyKey: input.idempotencyKey,
  }
  const lockHash = createHash('sha256').update(input.idempotencyKey).digest('hex')
  const lockKey = `billing:${input.organizationId}:${lockHash}`
  const deadline = Date.now() + lockWaitMs

  while (true) {
    const existing = await BillingTransaction.findOne(lookup)
    if (existing) return { transaction: existing, replayed: true }

    const lockToken = await acquireLock(lockKey, lockTtlMs)
    if (lockToken) {
      try {
        const session = await connection.startSession()
        try {
          session.startTransaction({ maxCommitTimeMS: transactionMaxCommitTimeMs })
          const [transaction] = await BillingTransaction.create([{
            ...input,
            transactionId: randomUUID(),
            currency: input.currency.toUpperCase(),
            status: 'pending',
          }], { session })
          await session.commitTransaction()
          return { transaction, replayed: false }
        } catch (error) {
          if (session.inTransaction()) {
            try {
              await session.abortTransaction()
            } catch (abortError) {
              console.error('Unable to abort failed billing transaction:', abortError)
            }
          }

          if (!duplicateKeyError(error)) throw error

          const duplicate = await BillingTransaction.findOne(lookup)
          if (!duplicate) throw error
          return { transaction: duplicate, replayed: true }
        } finally {
          try {
            await session.endSession()
          } catch (error) {
            console.error('Unable to end billing transaction session:', error)
          }
        }
      } finally {
        try {
          await releaseLock(lockKey, lockToken)
        } catch (error) {
          console.error('Unable to release billing lock:', error)
        }
      }
    }

    if (Date.now() >= deadline) throw new BillingLockUnavailableError()
    await delay(lockPollIntervalMs)
  }
}
