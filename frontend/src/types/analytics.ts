export type ResourceType = 'compute' | 'storage' | 'api_requests' | 'network'

export interface UsageSummary {
  resourceType: ResourceType
  usageUnit: string
  currency: string
  totalUsage: number
  totalCost: number
}

export interface UsageTrendPoint {
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
  organizationId: string
  period: {
    startDate: string
    endDate: string
  }
  resourceConsumption: UsageSummary[]
  usageTrend: UsageTrendPoint[]
  usageOverTime: UsageOverTimePoint[]
  spendingTrend: SpendingTrendPoint[]
  activeResources: number
  utilizationPercent: number | null
}

export interface ResourceDetail {
  resourceName: string
  resourceType: ResourceType
  usageAmount: number
  usageUnit: string
  cost: number
  currency: string
  recordedAt: string
}

export interface ResourceDetailsPage {
  success: true
  data: ResourceDetail[]
  page: number
  limit: number
  total: number
  totalPages: number
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
