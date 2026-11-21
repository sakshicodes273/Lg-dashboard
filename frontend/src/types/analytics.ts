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
