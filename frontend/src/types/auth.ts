export interface User {
  id: string
  name: string
  email: string
  organizationId: string
  role: 'owner' | 'admin' | 'member'
}

export interface DashboardMetrics {
  totalUsage: { value: string; change: string }
  monthlySpend: { value: string; change: string }
  activeResources: { value: string; change: string }
  utilization: { value: string; change: string }
}