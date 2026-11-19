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
  }

  return { createdRecords, findQuery, usageModel }
})

vi.mock('../src/models/UsageRecord.js', () => ({
  getUsageRecordModel: () => mocks.usageModel,
}))

import {
  createUsageRecord,
  listUsageRecords,
  summarizeUsage,
} from '../src/services/analyticsService.js'

const connection = {} as Parameters<typeof createUsageRecord>[0]

describe('analyticsService', () => {
  beforeEach(() => {
    mocks.createdRecords.length = 0
    mocks.usageModel.create.mockClear()
    mocks.usageModel.find.mockClear()
    mocks.usageModel.countDocuments.mockClear()
    mocks.usageModel.aggregate.mockClear()
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
})
