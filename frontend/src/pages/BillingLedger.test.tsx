// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '../services/api'
import type { BillingTransactionPage } from '../types/billing'
import { BillingLedger } from './BillingLedger'

vi.mock('../services/api', () => ({ apiRequest: vi.fn() }))

const request = vi.mocked(apiRequest)

const transactions: BillingTransactionPage = {
  transactions: [{
    transactionId: '4a222502-a17d-45cd-8b2f-f739d0df4c98',
    amount: 1_234_567.89,
    currency: 'INR',
    description: 'DEMO-IN: Mumbai compute services',
    status: 'successful',
    createdAt: '2026-11-22T08:00:00.000Z',
    updatedAt: '2026-11-22T08:00:00.000Z',
  }],
  page: 1,
  limit: 10,
  total: 1,
  totalPages: 1,
}

describe('Billing ledger Indian formatting', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue(transactions)
  })

  afterEach(cleanup)

  it('formats INR amounts with Indian digit grouping', async () => {
    render(<BillingLedger />)

    expect(await screen.findByText(/12,34,567\.89/)).toBeTruthy()
  })
})
