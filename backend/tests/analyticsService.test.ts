import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const createdRecords: Record<string, unknown>[] = []
  let currentFilter: Record<string, unknown> = {}
  const matchesFilter = (record: Record<string, unknown>, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([key, value]) => record[key] === value)
  const findQuery = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn(async () => createdRecords.filter((record) => matchesFilter(record, currentFilter))),
  }
  const usageModel = {
    create: vi.fn(async (input: Record<string, unknown>) => {
      createdRecords.push(input)
      return input
    }),
    find: vi.fn((filter: Record<string, unknown>) => {
      currentFilter = filter
      return findQuery
    }),
    countDocuments: vi.fn((filter: Record<string, unknown>) => ({
      exec: vi.fn(async () => createdRecords.filter((record) => matchesFilter(record, filter)).length),
    })),
    aggregate: vi.fn(() => ({ exec: vi.fn(async () => []) })),
    distinct: vi.fn(async () => ['resource-1']),
  }
  const billingModel = {
    aggregate: vi.fn(() => ({ exec: vi.fn(async () => []) })),
  }

  return { createdRecords, findQuery, usageModel, billingModel }
})

vi.mock('../src/models/UsageRecord.js', () => ({
  getUsageRecordModel: () => mocks.usageModel,
}))
vi.mock('../src/models/BillingTransaction.js', () => ({
  getBillingTransactionModel: () => mocks.billingModel,
}))

import {
  createUsageRecord,
  listUsageRecords,
  summarizeUsage,
  getDashboardAnalytics,
} from '../src/services/analyticsService.js'

const connection = {} as Parameters<typeof createUsageRecord>[0]

describe('analyticsService', () => {
  beforeEach(() => {
    mocks.createdRecords.length = 0
    mocks.usageModel.create.mockClear()
    mocks.usageModel.find.mockClear()
    mocks.usageModel.countDocuments.mockClear()
    mocks.usageModel.aggregate.mockClear()
    mocks.billingModel.aggregate.mockClear()
    mocks.usageModel.distinct.mockReset()
    mocks.usageModel.distinct.mockResolvedValue(['resource-1'])
    mocks.findQuery.exec.mockClear()
  })

  it('creates usage records with their organization association intact', async () => {
    const input = {
      organizationId: 'org-1',
      resourceType: 'storage' as const,
      usageAmount: 8,
      usageUnit: 'GB',
      cost: 2.5,
      currency: 'USD',
    }

    await createUsageRecord(connection, input)

    expect(mocks.usageModel.create).toHaveBeenCalledWith(input)
    expect(mocks.createdRecords[0].organizationId).toBe('org-1')
  })

  it('retrieves newly created records only for the requested organization', async () => {
    const record = {
      resourceType: 'compute' as const,
      usageAmount: 2,
      usageUnit: 'hours',
      cost: 1.25,
      currency: 'USD',
    }

    await createUsageRecord(connection, { ...record, organizationId: 'org-1' })
    await createUsageRecord(connection, { ...record, organizationId: 'org-2' })
    const page = await listUsageRecords(connection, {
      organizationId: 'org-1',
      page: 1,
      limit: 10,
    })

    expect(page.records).toEqual([{ ...record, organizationId: 'org-1' }])
    expect(page.total).toBe(1)
  })

  it('lists only the requested organization and applies date and resource filters', async () => {
    const startDate = new Date('2026-10-01T00:00:00.000Z')
    const endDate = new Date('2026-11-01T00:00:00.000Z')

    await listUsageRecords(connection, {
      organizationId: 'org-1',
      resourceType: 'compute',
      startDate,
      endDate,
      page: 1,
      limit: 25,
    })

    expect(mocks.usageModel.find).toHaveBeenCalledWith({
      organizationId: 'org-1',
      resourceType: 'compute',
      recordedAt: { $gte: startDate, $lt: endDate },
    })
  })

  it('aggregates only the organization and keeps unlike units and currencies separate', async () => {
    const startDate = new Date('2026-10-01T00:00:00.000Z')

    await summarizeUsage(connection, { organizationId: 'org-1', startDate })

    expect(mocks.usageModel.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
      { $match: { organizationId: 'org-1', recordedAt: { $gte: startDate } } },
      expect.objectContaining({
        $group: expect.objectContaining({
          _id: {
            resourceType: '$resourceType',
            usageUnit: '$usageUnit',
            currency: '$currency',
          },
        }),
      }),
    ]))
  })

  it('returns empty dashboard analytics when the tenant has no records', async () => {
    const startDate = new Date('2026-10-01T00:00:00.000Z')
    const endDate = new Date('2026-11-01T00:00:00.000Z')
    mocks.usageModel.distinct.mockResolvedValue([])

    const result = await getDashboardAnalytics(connection, {
      organizationId: 'org-1',
      startDate,
      endDate,
    })

    expect(result).toEqual({
      resourceConsumption: [],
      usageTrend: [],
      usageOverTime: [],
      spendingTrend: [],
      activeResources: 0,
      utilizationPercent: null,
    })
  })

  it('limits named resource counts and daily usage to the requested organization and period', async () => {
    const startDate = new Date('2026-10-01T00:00:00.000Z')
    const endDate = new Date('2026-11-01T00:00:00.000Z')

    const result = await getDashboardAnalytics(connection, {
      organizationId: 'org-1',
      startDate,
      endDate,
    })

    expect(result.activeResources).toBe(1)
    expect(mocks.usageModel.distinct).toHaveBeenCalledWith('resourceName', {
      organizationId: 'org-1',
      recordedAt: { $gte: startDate, $lt: endDate },
      resourceName: { $type: 'string', $ne: '' },
    })
    expect(mocks.usageModel.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
      { $match: { organizationId: 'org-1', recordedAt: { $gte: startDate, $lt: endDate } } },
      expect.objectContaining({
        $group: expect.objectContaining({
          _id: expect.objectContaining({
            $dateToString: expect.objectContaining({ date: '$recordedAt', timezone: 'UTC' }),
          }),
        }),
      }),
    ]))
  })

  it('applies the selected resource type to dashboard usage data', async () => {
    const startDate = new Date('2026-10-01T00:00:00.000Z')
    const endDate = new Date('2026-11-01T00:00:00.000Z')

    await getDashboardAnalytics(connection, {
      organizationId: 'org-1',
      startDate,
      endDate,
      resourceType: 'storage',
    })

    expect(mocks.usageModel.distinct).toHaveBeenCalledWith('resourceName', {
      organizationId: 'org-1',
      resourceType: 'storage',
      recordedAt: { $gte: startDate, $lt: endDate },
      resourceName: { $type: 'string', $ne: '' },
    })
    expect(mocks.usageModel.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
      { $match: { organizationId: 'org-1', resourceType: 'storage', recordedAt: { $gte: startDate, $lt: endDate } } },
    ]))
  })

  it('compares current and previous usage periods with one tenant-scoped aggregation', async () => {
    const startDate = new Date('2026-10-11T00:00:00.000Z')
    const endDate = new Date('2026-10-21T00:00:00.000Z')
    mocks.usageModel.aggregate.mockImplementationOnce(() => ({
      exec: vi.fn(async () => [
        {
          resourceType: 'compute',
          usageUnit: 'hours',
          currency: 'USD',
          currentUsage: 15,
          previousUsage: 10,
        },
        {
          resourceType: 'compute',
          usageUnit: 'GB',
          currency: 'USD',
          currentUsage: 2,
          previousUsage: 0,
        },
      ]),
    }))

    const { getUsageComparison } = await import('../src/services/analyticsService.js')
    const result = await getUsageComparison(connection, {
      organizationId: 'org-1',
      startDate,
      endDate,
      resourceType: 'compute',
    })

    expect(result).toEqual([{
      resourceType: 'compute',
      usageUnit: 'hours',
      currency: 'USD',
      currentUsage: 15,
      previousUsage: 10,
      percentageChange: 50,
    }, {
      resourceType: 'compute',
      usageUnit: 'GB',
      currency: 'USD',
      currentUsage: 2,
      previousUsage: 0,
      percentageChange: null,
    }])
    expect(mocks.usageModel.aggregate).toHaveBeenCalledTimes(1)
    expect(mocks.usageModel.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
      {
        $match: {
          organizationId: 'org-1',
          resourceType: 'compute',
          recordedAt: {
            $gte: new Date('2026-10-01T00:00:00.000Z'),
            $lt: endDate,
          },
        },
      },
    ]))
  })

  it('compares current and previous spending periods with one tenant-scoped aggregation', async () => {
    const startDate = new Date('2026-10-11T00:00:00.000Z')
    const endDate = new Date('2026-10-21T00:00:00.000Z')
    mocks.billingModel.aggregate.mockImplementationOnce(() => ({
      exec: vi.fn(async () => [
        {
          currency: 'INR',
          currentAmount: 0,
          previousAmount: 0,
          currentCount: 1,
          previousCount: 0,
        },
        {
          currency: 'USD',
          currentAmount: 150,
          previousAmount: 100,
          currentCount: 1,
          previousCount: 1,
        },
      ]),
    }))

    const { getSpendingComparison } = await import('../src/services/analyticsService.js')
    const result = await getSpendingComparison(connection, {
      organizationId: 'org-1',
      startDate,
      endDate,
    })

    expect(result).toEqual({
      current: [{ currency: 'INR', amount: 0 }, { currency: 'USD', amount: 150 }],
      previous: [{ currency: 'USD', amount: 100 }],
      difference: [{ currency: 'INR', amount: 0 }, { currency: 'USD', amount: 50 }],
      currency: ['INR', 'USD'],
    })
    expect(mocks.billingModel.aggregate).toHaveBeenCalledTimes(1)
    expect(mocks.billingModel.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
      {
        $match: {
          organizationId: 'org-1',
          status: 'successful',
          createdAt: {
            $gte: new Date('2026-10-01T00:00:00.000Z'),
            $lt: endDate,
          },
        },
      },
    ]))
  })
})
