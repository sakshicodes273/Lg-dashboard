// Runtime validation coverage for idempotent billing transactions.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'

const mocks = vi.hoisted(() => {
  const transactions = new Map<string, Record<string, unknown>>()
  const heldLocks = new Set<string>()
  const transactionKey = (organizationId: string, idempotencyKey: string) =>
    `${organizationId}:${idempotencyKey}`

  const billingModel = {
    init: vi.fn(async () => undefined),
    findOne: vi.fn(async ({ organizationId, idempotencyKey }: {
      organizationId: string
      idempotencyKey: string
    }) => transactions.get(transactionKey(organizationId, idempotencyKey)) ?? null),
    create: vi.fn(async (input: Record<string, unknown>) => {
      const key = transactionKey(
        input.organizationId as string,
        input.idempotencyKey as string,
      )
      if (transactions.has(key)) {
        throw Object.assign(new Error('Duplicate key'), { code: 11000 })
      }

      const transaction = {
        ...input,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      transactions.set(key, transaction)
      return transaction
    }),
  }

  const acquireLock = vi.fn(async (key: string) => {
    if (heldLocks.has(key)) return null
    heldLocks.add(key)
    return 'lock-token'
  })
  const releaseLock = vi.fn(async (key: string) => {
    heldLocks.delete(key)
    return true
  })

  return { transactions, heldLocks, billingModel, acquireLock, releaseLock }
})

vi.mock('../src/models/BillingTransaction.js', () => ({
  getBillingTransactionModel: () => mocks.billingModel,
}))

vi.mock('../src/services/lockService.js', () => ({
  acquireLock: mocks.acquireLock,
  releaseLock: mocks.releaseLock,
}))

vi.mock('../src/services/tenantConnectionService.js', () => ({
  TenantConnectionUnavailableError: class TenantConnectionUnavailableError extends Error {},
  getTenantConnection: vi.fn(async () => ({})),
}))

import app from '../src/app.js'
import { createBillingTransaction } from '../src/services/billingService.js'

const connection = {} as Parameters<typeof createBillingTransaction>[0]

function request(organizationId = 'org-1') {
  return {
    idempotencyKey: 'invoice-123',
    organizationId,
    amount: 125.5,
    currency: 'USD',
    description: 'Monthly subscription',
  }
}

describe('createBillingTransaction', () => {
  beforeEach(() => {
    mocks.transactions.clear()
    mocks.heldLocks.clear()
    mocks.billingModel.init.mockClear()
    mocks.billingModel.findOne.mockClear()
    mocks.billingModel.create.mockClear()
    mocks.acquireLock.mockClear()
    mocks.releaseLock.mockClear()
  })

  it('creates a pending transaction and returns it for a replay', async () => {
    const first = await createBillingTransaction(connection, request())
    const replay = await createBillingTransaction(connection, request())

    expect(first.replayed).toBe(false)
    expect(first.transaction.status).toBe('pending')
    expect(replay.replayed).toBe(true)
    expect(replay.transaction.transactionId).toBe(first.transaction.transactionId)
    expect(mocks.billingModel.create).toHaveBeenCalledTimes(1)
  })

  it('creates only one record for simultaneous requests with the same key', async () => {
    const results = await Promise.all([
      createBillingTransaction(connection, request()),
      createBillingTransaction(connection, request()),
    ])

    expect(mocks.billingModel.create).toHaveBeenCalledTimes(1)
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true])
    expect(results[0].transaction.transactionId).toBe(results[1].transaction.transactionId)
  })

  it('scopes an idempotency key to its organization', async () => {
    const first = await createBillingTransaction(connection, request('org-1'))
    const otherOrganization = await createBillingTransaction(connection, request('org-2'))

    expect(otherOrganization.replayed).toBe(false)
    expect(otherOrganization.transaction.transactionId).not.toBe(first.transaction.transactionId)
    expect(mocks.billingModel.create).toHaveBeenCalledTimes(2)
  })

  it('returns the created transaction through the authenticated billing route', async () => {
    const secret = 'billing-test-secret-with-at-least-32-characters'
    vi.stubEnv('JWT_SECRET', secret)
    const token = jwt.sign(
      { userId: 'user-1', organizationId: 'org-1', role: 'owner' },
      secret,
    )
    const server = app.listen(0)

    try {
      await new Promise<void>((resolve) => server.once('listening', resolve))
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port')

      const submit = () => fetch(`http://127.0.0.1:${address.port}/api/billing/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Connection: 'close',
          Cookie: `ledgerguard_session=${token}`,
        },
        body: JSON.stringify({ ...request(), organizationId: 'another-org' }),
      })
      const response = await submit()
      const payload = await response.json() as {
        transaction: { transactionId: string; organizationId: string; status: string }
        replayed: boolean
      }
      const replayResponse = await submit()
      const replay = await replayResponse.json() as typeof payload & { replayed: boolean }

      expect(response.status).toBe(201)
      expect(payload.transaction.status).toBe('pending')
      expect(payload.replayed).toBe(false)
      expect(payload.transaction.organizationId).toBe('org-1')
      expect(replayResponse.status).toBe(200)
      expect(replay.replayed).toBe(true)
      expect(replay.transaction.transactionId).toBe(payload.transaction.transactionId)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
      vi.unstubAllEnvs()
    }
  })
})
