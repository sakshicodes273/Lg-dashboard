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

export interface DashboardAnalytics {
  organizationId: string
  period: {
    startDate: string
    endDate: string
  }
  resourceConsumption: UsageSummary[]
  usageTrend: UsageTrendPoint[]
  activeResources: number
  utilizationPercent: number | null
}
