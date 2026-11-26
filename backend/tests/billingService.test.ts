// Runtime validation coverage for idempotent billing transactions.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'

const mocks = vi.hoisted(() => {
  const transactions = new Map<string, Record<string, unknown>>()
  const heldLocks = new Set<string>()
  const pendingWrites = new Map<string, Record<string, unknown>>()
  const transactionKey = (organizationId: string, idempotencyKey: string) =>
    `${organizationId}:${idempotencyKey}`

  let transactionActive = false
  let commitError: Error | undefined
  const session = {
    startTransaction: vi.fn(() => {
      transactionActive = true
      pendingWrites.clear()
    }),
    commitTransaction: vi.fn(async () => {
      if (commitError) throw commitError
      for (const [key, transaction] of pendingWrites) transactions.set(key, transaction)
      pendingWrites.clear()
      transactionActive = false
    }),
    abortTransaction: vi.fn(async () => {
      pendingWrites.clear()
      transactionActive = false
    }),
    inTransaction: vi.fn(() => transactionActive),
    endSession: vi.fn(async () => {
      transactionActive = false
    }),
  }
  const connection = {
    startSession: vi.fn(async () => session),
  }

  const billingModel = {
    init: vi.fn(async () => undefined),
    findOne: vi.fn((filter: Record<string, unknown>) => {
      const found = Promise.resolve(Array.from(transactions.values()).find((transaction) =>
        Object.entries(filter).every(([key, value]) => transaction[key] === value),
      ) ?? null)
      return {
        then: found.then.bind(found),
        lean: vi.fn(() => ({ exec: () => found })),
      }
    }),
    find: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn(async () => []),
    })),
    countDocuments: vi.fn(() => ({ exec: vi.fn(async () => 0) })),
    create: vi.fn(async (
      [input]: [Record<string, unknown>],
      options?: { session?: typeof session },
    ) => {
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
      if (options?.session?.inTransaction()) pendingWrites.set(key, transaction)
      else transactions.set(key, transaction)
      return [transaction]
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

  const resetTransactionState = () => {
    transactionActive = false
    commitError = undefined
    pendingWrites.clear()
  }
  const failCommitWith = (error: Error) => {
    commitError = error
  }

  return {
    transactions,
    heldLocks,
    billingModel,
    acquireLock,
    releaseLock,
    session,
    connection,
    resetTransactionState,
    failCommitWith,
  }
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
  getTenantConnection: vi.fn(async () => mocks.connection),
}))

import app from '../src/app.js'
import { createBillingTransaction } from '../src/services/billingService.js'

const connection = mocks.connection as unknown as Parameters<typeof createBillingTransaction>[0]
const routeOrganizationId = '00000000-0000-4000-8000-000000000003'

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
    mocks.billingModel.find.mockClear()
    mocks.billingModel.countDocuments.mockClear()
    mocks.billingModel.create.mockClear()
    mocks.acquireLock.mockClear()
    mocks.releaseLock.mockClear()
    connection.startSession.mockClear()
    mocks.session.startTransaction.mockClear()
    mocks.session.commitTransaction.mockClear()
    mocks.session.abortTransaction.mockClear()
    mocks.session.endSession.mockClear()
    mocks.resetTransactionState()
  })

  it('creates a pending transaction and returns it for a replay', async () => {
    const first = await createBillingTransaction(connection, request())
    const replay = await createBillingTransaction(connection, request())

    expect(first.replayed).toBe(false)
    expect(first.transaction.status).toBe('pending')
    expect(replay.replayed).toBe(true)
    expect(replay.transaction.transactionId).toBe(first.transaction.transactionId)
    expect(mocks.billingModel.create).toHaveBeenCalledTimes(1)
    expect(mocks.session.startTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.session.commitTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.session.abortTransaction).not.toHaveBeenCalled()
    expect(mocks.session.endSession).toHaveBeenCalledTimes(1)
    expect(mocks.releaseLock).toHaveBeenCalledTimes(1)
  })

  it('rolls back the billing record when the transaction commit fails', async () => {
    mocks.failCommitWith(new Error('Commit timed out'))

    await expect(createBillingTransaction(connection, request())).rejects.toThrow('Commit timed out')

    expect(mocks.transactions.size).toBe(0)
    expect(mocks.session.abortTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.session.endSession).toHaveBeenCalledTimes(1)
    expect(mocks.releaseLock).toHaveBeenCalledTimes(1)
    expect(mocks.heldLocks.size).toBe(0)
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

  it('lists transactions with organization, status, date, and pagination filters', async () => {
    const { listBillingTransactions } = await import('../src/services/billingService.js')
    const startDate = new Date('2026-10-01T00:00:00.000Z')
    const endDate = new Date('2026-11-01T00:00:00.000Z')
    mocks.billingModel.countDocuments.mockReturnValueOnce({
      exec: vi.fn(async () => 21),
    })

    const result = await listBillingTransactions(connection, {
      organizationId: 'org-1',
      status: 'successful',
      startDate,
      endDate,
      page: 2,
      limit: 10,
    })

    expect(mocks.billingModel.find).toHaveBeenCalledWith({
      organizationId: 'org-1',
      status: 'successful',
      createdAt: { $gte: startDate, $lt: endDate },
    })
    expect(result).toEqual({
      transactions: [],
      page: 2,
      limit: 10,
      total: 21,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    })
    expect(mocks.billingModel.find).toHaveBeenCalledWith({
      organizationId: 'org-1',
      status: 'successful',
      createdAt: { $gte: startDate, $lt: endDate },
    })
    expect(mocks.billingModel.find.mock.results[0].value.select).toHaveBeenCalledWith({
      transactionId: 1,
      amount: 1,
      currency: 1,
      description: 1,
      status: 1,
      createdAt: 1,
      updatedAt: 1,
      _id: 0,
    })
  })

  it('does not turn a committed transaction into a failed request if lock release errors', async () => {
    mocks.releaseLock.mockRejectedValueOnce(new Error('Redis unavailable'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const result = await createBillingTransaction(connection, request())

      expect(result.replayed).toBe(false)
      expect(mocks.transactions.size).toBe(1)
      expect(errorSpy).toHaveBeenCalledWith(
        'Unable to release billing lock:',
        expect.any(Error),
      )
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('requires authentication before reading billing transactions', async () => {
    const server = app.listen(0)

    try {
      await new Promise<void>((resolve) => server.once('listening', resolve))
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port')
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/billing/transactions`,
        { headers: { Connection: 'close' } },
      )

      expect(response.status).toBe(401)
      expect(mocks.billingModel.find).not.toHaveBeenCalled()
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
    }
  })

  it('returns the created transaction through the authenticated billing route', async () => {
    const secret = 'billing-test-secret-with-at-least-32-characters'
    vi.stubEnv('JWT_SECRET', secret)
    const token = jwt.sign(
      { userId: 'user-1', organizationId: routeOrganizationId, role: 'owner' },
      secret,
      { expiresIn: '7d' },
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
      expect(payload.transaction.organizationId).toBe(routeOrganizationId)
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

  it('validates ledger query parameters and applies the authenticated organization scope', async () => {
    const secret = 'billing-test-secret-with-at-least-32-characters'
    vi.stubEnv('JWT_SECRET', secret)
    const token = jwt.sign(
      { userId: 'user-1', organizationId: routeOrganizationId, role: 'owner' },
      secret,
      { expiresIn: '7d' },
    )
    const server = app.listen(0)

    try {
      await new Promise<void>((resolve) => server.once('listening', resolve))
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port')
      const request = (query: string) => fetch(
        `http://127.0.0.1:${address.port}/api/billing/transactions${query}`,
        { headers: { Connection: 'close', Cookie: `ledgerguard_session=${token}` } },
      )

      const response = await request('?status=successful&startDate=2026-10-01&endDate=2026-10-31&page=2&limit=10')
      expect(response.status).toBe(200)
      expect(mocks.billingModel.find).toHaveBeenCalledWith({
        organizationId: routeOrganizationId,
        status: 'successful',
        createdAt: {
          $gte: new Date('2026-10-01T00:00:00.000Z'),
          $lt: new Date('2026-11-01T00:00:00.000Z'),
        },
      })

      const invalid = await request('?status=processing')
      expect(invalid.status).toBe(400)
      expect(mocks.billingModel.find).toHaveBeenCalledTimes(1)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
      vi.unstubAllEnvs()
    }
  })

  it('retrieves transaction details using both transaction and organization IDs', async () => {
    const secret = 'billing-test-secret-with-at-least-32-characters'
    vi.stubEnv('JWT_SECRET', secret)
    const token = jwt.sign(
      { userId: 'user-1', organizationId: routeOrganizationId, role: 'owner' },
      secret,
      { expiresIn: '7d' },
    )
    const server = app.listen(0)
    const transactionId = 'c4b8e4d7-1163-4f05-a448-520613bd934a'
    mocks.transactions.set('another-org:foreign-transaction', {
      transactionId,
      organizationId: 'another-org',
    })

    try {
      await new Promise<void>((resolve) => server.once('listening', resolve))
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port')
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/billing/transactions/${transactionId}`,
        { headers: { Connection: 'close', Cookie: `ledgerguard_session=${token}` } },
      )

      expect(response.status).toBe(404)
      expect(mocks.billingModel.findOne).toHaveBeenCalledWith({
        organizationId: routeOrganizationId,
        transactionId,
      })
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
      vi.unstubAllEnvs()
    }
  })
})
