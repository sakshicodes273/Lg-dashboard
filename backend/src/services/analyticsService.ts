import type { Connection, HydratedDocument } from 'mongoose'
import {
  getUsageRecordModel,
  type CreateUsageRecordInput,
  type ResourceType,
  type UsageRecord,
} from '../models/UsageRecord.js'

export interface ListUsageRecordsInput {
  organizationId: string
  resourceType?: ResourceType
  startDate?: Date
  endDate?: Date
  page: number
  limit: number
}

export interface UsageRecordPage {
  records: UsageRecord[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface UsageSummary {
  resourceType: ResourceType
  usageUnit: string
  currency: string
  totalUsage: number
  totalCost: number
}

export interface UsageSummaryInput {
  organizationId: string
  startDate?: Date
  endDate?: Date
}

export interface DashboardUsageTrendPoint {
  date: string
  records: number
}

export interface DashboardAnalytics {
  resourceConsumption: UsageSummary[]
  usageTrend: DashboardUsageTrendPoint[]
  activeResources: number
  utilizationPercent: number | null
}

function createUsageMatch(input: UsageSummaryInput): Record<string, unknown> {
  const match: Record<string, unknown> = { organizationId: input.organizationId }
  if (input.startDate || input.endDate) {
    match.recordedAt = {
      ...(input.startDate ? { $gte: input.startDate } : {}),
      ...(input.endDate ? { $lt: input.endDate } : {}),
    }
  }
  return match
}

export async function createUsageRecord(
  connection: Connection,
  input: CreateUsageRecordInput,
): Promise<HydratedDocument<UsageRecord>> {
  const UsageRecordModel = getUsageRecordModel(connection)
  return UsageRecordModel.create(input)
}

export async function listUsageRecords(
  connection: Connection,
  input: ListUsageRecordsInput,
): Promise<UsageRecordPage> {
  const UsageRecordModel = getUsageRecordModel(connection)
  const filter: Record<string, unknown> = { organizationId: input.organizationId }

  if (input.resourceType) filter.resourceType = input.resourceType
  if (input.startDate || input.endDate) {
    filter.recordedAt = {
      ...(input.startDate ? { $gte: input.startDate } : {}),
      ...(input.endDate ? { $lt: input.endDate } : {}),
    }
  }

  const [records, total] = await Promise.all([
    UsageRecordModel.find(filter)
      .sort({ recordedAt: -1, _id: 1 })
      .skip((input.page - 1) * input.limit)
      .limit(input.limit)
      .lean()
      .exec(),
    UsageRecordModel.countDocuments(filter).exec(),
  ])

  return {
    records,
    page: input.page,
    limit: input.limit,
    total,
    totalPages: Math.ceil(total / input.limit),
  }
}

export async function summarizeUsage(
  connection: Connection,
  input: UsageSummaryInput,
): Promise<UsageSummary[]> {
  return getUsageRecordModel(connection).aggregate<UsageSummary>([
    { $match: createUsageMatch(input) },
    {
      $group: {
        _id: {
          resourceType: '$resourceType',
          usageUnit: '$usageUnit',
          currency: '$currency',
        },
        totalUsage: { $sum: '$usageAmount' },
        totalCost: { $sum: '$cost' },
      },
    },
    {
      $project: {
        _id: 0,
        resourceType: '$_id.resourceType',
        usageUnit: '$_id.usageUnit',
        currency: '$_id.currency',
        totalUsage: 1,
        totalCost: 1,
      },
    },
    { $sort: { resourceType: 1, usageUnit: 1, currency: 1 } },
  ]).exec()
}

export async function getDashboardAnalytics(
  connection: Connection,
  input: UsageSummaryInput,
): Promise<DashboardAnalytics> {
  const UsageRecordModel = getUsageRecordModel(connection)
  const match = createUsageMatch(input)
  const [resourceConsumption, resourceNames, usageTrend] = await Promise.all([
    summarizeUsage(connection, input),
    UsageRecordModel.distinct('resourceName', {
      ...match,
      resourceName: { $type: 'string', $ne: '' },
    }),
    UsageRecordModel.aggregate<DashboardUsageTrendPoint>([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$recordedAt',
              timezone: 'UTC',
            },
          },
          records: { $sum: 1 },
        },
      },
      { $project: { _id: 0, date: '$_id', records: 1 } },
      { $sort: { date: 1 } },
    ]).exec(),
  ])

  return {
    resourceConsumption,
    usageTrend,
    activeResources: resourceNames.length,
    utilizationPercent: null,
  }
}
