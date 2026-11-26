export type BillingStatus = 'pending' | 'successful' | 'failed'

export interface BillingTransaction {
  transactionId: string
  amount: number
  currency: string
  description: string
  status: BillingStatus
  createdAt: string
  updatedAt: string
}

export interface BillingTransactionPage {
  transactions: BillingTransaction[]
  page: number
  limit: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}
