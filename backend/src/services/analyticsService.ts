import type { Connection, HydratedDocument } from 'mongoose'
import {
  getUsageRecordModel,
  type CreateUsageRecordInput,
  type ResourceType,
  type UsageRecord,
} from '../models/UsageRecord.js'
import { getBillingTransactionModel } from '../models/BillingTransaction.js'

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

export interface UsageOverTimePoint {
  date: string
  resourceType: ResourceType
  usageUnit: string
  totalUsage: number
}

export interface SpendingTrendPoint {
  date: string
  currency: string
  totalCost: number
}

export interface DashboardAnalytics {
  resourceConsumption: UsageSummary[]
  usageTrend: DashboardUsageTrendPoint[]
  usageOverTime: UsageOverTimePoint[]
  spendingTrend: SpendingTrendPoint[]
  activeResources: number
  utilizationPercent: number | null
}

export interface ResourceDetailsInput {
  organizationId: string
  resourceType?: ResourceType
  startDate?: Date
  endDate?: Date
  sortBy: 'usage' | 'cost' | 'recordedAt'
  order: 'asc' | 'desc'
  page: number
  limit: number
}

export interface ResourceDetail {
  resourceName: string
  resourceType: ResourceType
  usageAmount: number
  usageUnit: string
  cost: number
  currency: string
  recordedAt: Date
}

export interface ResourceDetailsPage {
  data: ResourceDetail[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PeriodUsageInput {
  organizationId: string
  startDate: Date
  endDate: Date
  resourceType?: ResourceType
}

export interface UsageComparisonItem {
  resourceType: ResourceType
  usageUnit: string
  currency: string
  currentUsage: number
  previousUsage: number
  percentageChange: number | null
}

export interface SpendingAmount {
  currency: string
  amount: number
}

export interface SpendingComparison {
  current: SpendingAmount[]
  previous: SpendingAmount[]
  difference: SpendingAmount[]
  currency: string[]
}

export interface BillingInsights {
  successful: SpendingAmount[]
  pending: SpendingAmount[]
  failed: SpendingAmount[]
  statusCounts: {
    successful: number
    pending: number
    failed: number
  }
  highestCostResource: {
    resourceType: ResourceType | null
    resourceName: string | null
    cost: number
    currency: string | null
  }
  spendingTrend: SpendingTrendPoint[]
  costDistribution: Array<{
    resourceType: ResourceType
    currency: string
    cost: number
  }>
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
  const BillingTransactionModel = getBillingTransactionModel(connection)
  const match = createUsageMatch(input)
  const billingMatch: Record<string, unknown> = {
    organizationId: input.organizationId,
    status: 'successful',
  }
  if (input.startDate || input.endDate) {
    billingMatch.createdAt = {
      ...(input.startDate ? { $gte: input.startDate } : {}),
      ...(input.endDate ? { $lt: input.endDate } : {}),
    }
  }
  const [resourceConsumption, resourceNames, usageTrend, usageOverTime, spendingTrend] = await Promise.all([
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
    UsageRecordModel.aggregate<UsageOverTimePoint>([
      { $match: match },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$recordedAt',
                timezone: 'UTC',
              },
            },
            resourceType: '$resourceType',
            usageUnit: '$usageUnit',
          },
          totalUsage: { $sum: '$usageAmount' },
        },
      },
      {
        $project: {
          _id: 0,
          date: '$_id.date',
          resourceType: '$_id.resourceType',
          usageUnit: '$_id.usageUnit',
          totalUsage: 1,
        },
      },
      { $sort: { date: 1, resourceType: 1, usageUnit: 1 } },
    ]).exec(),
    BillingTransactionModel.aggregate<SpendingTrendPoint>([
      { $match: billingMatch },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: 'UTC',
              },
            },
            currency: '$currency',
          },
          totalCost: { $sum: '$amount' },
        },
      },
      {
        $project: {
          _id: 0,
          date: '$_id.date',
          currency: '$_id.currency',
          totalCost: 1,
        },
      },
      { $sort: { date: 1, currency: 1 } },
    ]).exec(),
  ])

  return {
    resourceConsumption,
    usageTrend,
    usageOverTime,
    spendingTrend,
    activeResources: resourceNames.length,
    utilizationPercent: null,
  }
}

export async function getResourceDetails(
  connection: Connection,
  input: ResourceDetailsInput,
): Promise<ResourceDetailsPage> {
  const match: Record<string, unknown> = { organizationId: input.organizationId }
  if (input.resourceType) match.resourceType = input.resourceType
  if (input.startDate || input.endDate) {
    match.recordedAt = {
      ...(input.startDate ? { $gte: input.startDate } : {}),
      ...(input.endDate ? { $lt: input.endDate } : {}),
    }
  }

  const sortField = input.sortBy === 'usage'
    ? 'usageAmount'
    : input.sortBy === 'cost'
      ? 'cost'
      : 'recordedAt'
  const sortDirection = input.order === 'asc' ? 1 : -1

  const usageModel = getUsageRecordModel(connection)
  const [data, totalRows] = await Promise.all([
    usageModel.aggregate<ResourceDetail>([
      { $match: match },
      {
        $group: {
          _id: {
            resourceName: { $ifNull: ['$resourceName', 'Unnamed resource'] },
            resourceType: '$resourceType',
            usageUnit: '$usageUnit',
            currency: '$currency',
          },
          usageAmount: { $sum: '$usageAmount' },
          cost: { $sum: '$cost' },
          recordedAt: { $max: '$recordedAt' },
        },
      },
      {
        $project: {
          _id: 0,
          resourceName: '$_id.resourceName',
          resourceType: '$_id.resourceType',
          usageAmount: 1,
          usageUnit: '$_id.usageUnit',
          cost: 1,
          currency: '$_id.currency',
          recordedAt: 1,
        },
      },
      { $sort: { [sortField]: sortDirection, resourceName: 1 } },
      { $skip: (input.page - 1) * input.limit },
      { $limit: input.limit },
    ]).exec(),
    usageModel.aggregate<{ count: number }>([
      { $match: match },
      {
        $group: {
          _id: {
            resourceName: { $ifNull: ['$resourceName', 'Unnamed resource'] },
            resourceType: '$resourceType',
            usageUnit: '$usageUnit',
            currency: '$currency',
          },
        },
      },
      { $count: 'count' },
    ]).exec(),
  ])

  const total = totalRows[0]?.count ?? 0
  return {
    data,
    page: input.page,
    limit: input.limit,
    total,
    totalPages: Math.ceil(total / input.limit),
  }
}

export async function getUsageComparison(
  connection: Connection,
  input: PeriodUsageInput,
): Promise<UsageComparisonItem[]> {
  const usageModel = getUsageRecordModel(connection)
  const duration = input.endDate.getTime() - input.startDate.getTime()
  const previousStart = new Date(input.startDate.getTime() - duration)
  const previousEnd = input.startDate
  const baseMatch: Record<string, unknown> = {
    organizationId: input.organizationId,
    ...(input.resourceType ? { resourceType: input.resourceType } : {}),
  }

  const aggregatePeriod = (startDate: Date, endDate: Date) => usageModel.aggregate<{
    resourceType: ResourceType
    usageUnit: string
    currency: string
    totalUsage: number
  }>([
    {
      $match: {
        ...baseMatch,
        recordedAt: { $gte: startDate, $lt: endDate },
      },
    },
    {
      $group: {
        _id: { resourceType: '$resourceType', usageUnit: '$usageUnit', currency: '$currency' },
        totalUsage: { $sum: '$usageAmount' },
      },
    },
    {
      $project: {
        _id: 0,
        resourceType: '$_id.resourceType',
        usageUnit: '$_id.usageUnit',
        currency: '$_id.currency',
        totalUsage: 1,
      },
    },
  ]).exec()

  const [current, previous] = await Promise.all([
    aggregatePeriod(input.startDate, input.endDate),
    aggregatePeriod(previousStart, previousEnd),
  ])
  const previousMap = new Map(
    previous.map((item) => [`${item.resourceType}|${item.usageUnit}|${item.currency}`, item.totalUsage]),
  )
  const keys = new Set([
    ...current.map((item) => `${item.resourceType}|${item.usageUnit}|${item.currency}`),
    ...previous.map((item) => `${item.resourceType}|${item.usageUnit}|${item.currency}`),
  ])
  const items = new Map<string, UsageComparisonItem>()
  for (const item of [...current, ...previous]) {
    const key = `${item.resourceType}|${item.usageUnit}|${item.currency}`
    if (!items.has(key)) {
      items.set(key, {
        resourceType: item.resourceType,
        usageUnit: item.usageUnit,
        currency: item.currency,
        currentUsage: 0,
        previousUsage: 0,
        percentageChange: null,
      })
    }
  }
  for (const item of current) {
    const key = `${item.resourceType}|${item.usageUnit}|${item.currency}`
    items.get(key)!.currentUsage = item.totalUsage
  }
  for (const item of previous) {
    const key = `${item.resourceType}|${item.usageUnit}|${item.currency}`
    items.get(key)!.previousUsage = item.totalUsage
  }
  return Array.from(items.values()).map((item) => {
    const previousValue = previousMap.get(`${item.resourceType}|${item.usageUnit}|${item.currency}`) ?? 0
    return {
      ...item,
      percentageChange: previousValue > 0
        ? ((item.currentUsage - item.previousUsage) / previousValue) * 100
        : null,
    }
  }).sort((a, b) => a.resourceType.localeCompare(b.resourceType))
}

export async function getSpendingComparison(
  connection: Connection,
  input: PeriodUsageInput,
): Promise<SpendingComparison> {
  const billingModel = getBillingTransactionModel(connection)
  const duration = input.endDate.getTime() - input.startDate.getTime()
  const previousStart = new Date(input.startDate.getTime() - duration)
  const previousEnd = input.startDate

  const aggregatePeriod = (startDate: Date, endDate: Date) => billingModel.aggregate<SpendingAmount>([
    {
      $match: {
        organizationId: input.organizationId,
        status: 'successful',
        createdAt: { $gte: startDate, $lt: endDate },
      },
    },
    { $group: { _id: '$currency', amount: { $sum: '$amount' } } },
    { $project: { _id: 0, currency: '$_id', amount: 1 } },
  ]).exec()

  const [current, previous] = await Promise.all([
    aggregatePeriod(input.startDate, input.endDate),
    aggregatePeriod(previousStart, previousEnd),
  ])
  const currencies = Array.from(new Set([...current, ...previous].map((item) => item.currency))).sort()
  const difference = currencies.map((currency) => ({
    currency,
    amount: (current.find((item) => item.currency === currency)?.amount ?? 0)
      - (previous.find((item) => item.currency === currency)?.amount ?? 0),
  }))
  return { current, previous, difference, currency: currencies }
}

export async function getBillingInsights(
  connection: Connection,
  input: UsageSummaryInput,
): Promise<BillingInsights> {
  const usageModel = getUsageRecordModel(connection)
  const billingModel = getBillingTransactionModel(connection)
  const usageMatch = createUsageMatch(input)
  const billingMatch: Record<string, unknown> = { organizationId: input.organizationId }
  if (input.startDate || input.endDate) {
    billingMatch.createdAt = {
      ...(input.startDate ? { $gte: input.startDate } : {}),
      ...(input.endDate ? { $lt: input.endDate } : {}),
    }
  }

  const [statusRows, highestCostRows, costDistribution, spendingTrend] = await Promise.all([
    billingModel.aggregate<{
      status: 'successful' | 'pending' | 'failed'
      count: number
      currency: string
      amount: number
    }>([
      { $match: billingMatch },
      {
        $group: {
          _id: { status: '$status', currency: '$currency' },
          count: { $sum: 1 },
          amount: { $sum: '$amount' },
        },
      },
      { $project: { _id: 0, status: '$_id.status', currency: '$_id.currency', count: 1, amount: 1 } },
      { $sort: { status: 1, currency: 1 } },
    ]).exec(),
    usageModel.aggregate<{
      resourceType: ResourceType
      resourceName: string
      cost: number
      currency: string
    }>([
      { $match: usageMatch },
      {
        $group: {
          _id: { resourceType: '$resourceType', resourceName: { $ifNull: ['$resourceName', 'Unnamed resource'] }, currency: '$currency' },
          cost: { $sum: '$cost' },
        },
      },
      { $sort: { cost: -1 } },
      { $limit: 1 },
      { $project: { _id: 0, resourceType: '$_id.resourceType', resourceName: '$_id.resourceName', currency: '$_id.currency', cost: 1 } },
    ]).exec(),
    usageModel.aggregate<{
      resourceType: ResourceType
      currency: string
      cost: number
    }>([
      { $match: usageMatch },
      { $group: { _id: { resourceType: '$resourceType', currency: '$currency' }, cost: { $sum: '$cost' } } },
      { $project: { _id: 0, resourceType: '$_id.resourceType', currency: '$_id.currency', cost: 1 } },
      { $sort: { resourceType: 1, currency: 1 } },
    ]).exec(),
    billingModel.aggregate<SpendingTrendPoint>([
      { $match: { ...billingMatch, status: 'successful' } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
            currency: '$currency',
          },
          totalCost: { $sum: '$amount' },
        },
      },
      { $project: { _id: 0, date: '$_id.date', currency: '$_id.currency', totalCost: 1 } },
      { $sort: { date: 1, currency: 1 } },
    ]).exec(),
  ])

  const statusCounts = { successful: 0, pending: 0, failed: 0 }
  const successful: SpendingAmount[] = []
  const pending: SpendingAmount[] = []
  const failed: SpendingAmount[] = []
  for (const row of statusRows) {
    statusCounts[row.status] += row.count
    const destination = row.status === 'successful' ? successful : row.status === 'pending' ? pending : failed
    destination.push({ currency: row.currency, amount: row.amount })
  }

  const highest = highestCostRows[0]
  return {
    successful,
    pending,
    failed,
    statusCounts,
    highestCostResource: highest
      ? { resourceType: highest.resourceType, resourceName: highest.resourceName, cost: highest.cost, currency: highest.currency }
      : { resourceType: null, resourceName: null, cost: 0, currency: null },
    spendingTrend,
    costDistribution,
  }
}
