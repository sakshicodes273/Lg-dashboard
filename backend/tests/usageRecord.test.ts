import { afterAll, describe, expect, it } from 'vitest'
import { createConnection } from 'mongoose'
import { getUsageRecordModel, resourceTypes } from '../src/models/UsageRecord.js'

const connection = createConnection()
const UsageRecordModel = getUsageRecordModel(connection)

afterAll(async () => {
  await connection.close()
})

describe('UsageRecord model', () => {
  it('requires an organization and valid resource and cost fields', async () => {
    const record = new UsageRecordModel({
      resourceType: 'compute',
      usageAmount: 2,
      usageUnit: 'hours',
      cost: 1.25,
      currency: 'usd',
    })

    await expect(record.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        organizationId: expect.anything(),
      }),
    })

    record.organizationId = 'org-1'
    await expect(record.validate()).resolves.toBeUndefined()
    expect(record.currency).toBe('USD')
    expect(resourceTypes).toEqual(['compute', 'storage', 'api_requests', 'network'])
  })

  it('indexes organization with recorded date and resource type', () => {
    const indexes = UsageRecordModel.schema.indexes().map(([fields]) => fields)

    expect(indexes).toContainEqual({ organizationId: 1, recordedAt: -1 })
    expect(indexes).toContainEqual({ organizationId: 1, resourceType: 1, recordedAt: -1 })
  })
})
