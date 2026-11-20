// Runtime validation coverage for: organization usage analytics dashboard
// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { apiRequest } from '../services/api'
import type { DashboardAnalytics } from '../types/analytics'
import { Dashboard } from './Dashboard'

vi.mock('../services/api', () => ({ apiRequest: vi.fn() }))

const request = vi.mocked(apiRequest)

const populatedAnalytics: DashboardAnalytics = {
  organizationId: 'org-1',
  period: { startDate: '2026-11-01', endDate: '2026-11-30' },
  resourceConsumption: [
    { resourceType: 'compute', usageUnit: 'GB', currency: 'USD', totalUsage: 2.5, totalCost: 12.5 },
    { resourceType: 'storage', usageUnit: 'GB', currency: 'USD', totalUsage: 3, totalCost: 7.5 },
  ],
  usageTrend: [{ date: '2026-11-02', records: 2 }],
  activeResources: 2,
  utilizationPercent: null,
}

function renderDashboard() {
  return render(<MemoryRouter><Dashboard /></MemoryRouter>)
}

describe('Dashboard analytics', () => {
  beforeEach(() => {
    request.mockReset()
  })

  afterEach(cleanup)

  it('renders usage and spend returned by the organization analytics API', async () => {
    request.mockResolvedValue(populatedAnalytics)

    renderDashboard()

    expect(await screen.findByText('5.5 GB')).toBeTruthy()
    expect(screen.getByText('$20.00')).toBeTruthy()
    expect(screen.getByText(/Compute/)).toBeTruthy()
    expect(screen.getByText('Named resources with recorded usage').parentElement?.textContent).toContain('2')
    expect(request.mock.calls[0][0]).toMatch(/^\/dashboard\?startDate=\d{4}-\d{2}-\d{2}&endDate=\d{4}-\d{2}-\d{2}$/)
  })

  it('shows zero usage and empty states when the organization has no records', async () => {
    request.mockResolvedValue({
      ...populatedAnalytics,
      resourceConsumption: [],
      usageTrend: [],
      activeResources: 0,
    })

    renderDashboard()

    expect(await screen.findByText('No usage records for this date range.')).toBeTruthy()
    expect(screen.getByText('No resource consumption recorded for this date range.')).toBeTruthy()
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2)
  })

  it('shows an actionable error when the analytics API request fails', async () => {
    request.mockRejectedValue(new Error('Analytics service unavailable'))

    renderDashboard()

    expect(await screen.findByText('Analytics service unavailable')).toBeTruthy()
  })
})
