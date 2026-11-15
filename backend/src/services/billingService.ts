import { createHash, randomUUID } from 'node:crypto'
import type { Connection, HydratedDocument } from 'mongoose'
import { acquireLock, releaseLock } from './lockService.js'
import {
  getBillingTransactionModel,
  type BillingTransactionRecord,
} from '../models/BillingTransaction.js'

const lockTtlMs = 30000
const lockWaitMs = 5000
const lockPollIntervalMs = 50

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
        const transaction = await BillingTransaction.create({
          ...input,
          transactionId: randomUUID(),
          currency: input.currency.toUpperCase(),
          status: 'pending',
        })
        return { transaction, replayed: false }
      } catch (error) {
        if (!duplicateKeyError(error)) throw error

        const duplicate = await BillingTransaction.findOne(lookup)
        if (!duplicate) throw error
        return { transaction: duplicate, replayed: true }
      } finally {
        await releaseLock(lockKey, lockToken)
      }
    }

    if (Date.now() >= deadline) throw new BillingLockUnavailableError()
    await delay(lockPollIntervalMs)
  }
}
