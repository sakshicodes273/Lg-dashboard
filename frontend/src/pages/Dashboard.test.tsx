// Runtime validation coverage for: organization usage analytics dashboard
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { apiRequest, downloadCsv } from '../services/api'
import type { DashboardAnalytics } from '../types/analytics'
import { Dashboard } from './Dashboard'

vi.mock('../services/api', () => ({ apiRequest: vi.fn(), downloadCsv: vi.fn() }))

const request = vi.mocked(apiRequest)
const download = vi.mocked(downloadCsv)

const populatedAnalytics: DashboardAnalytics = {
  organizationId: 'org-1',
  period: { startDate: '2026-11-01', endDate: '2026-11-30' },
  resourceConsumption: [
    { resourceType: 'compute', usageUnit: 'GB', currency: 'INR', totalUsage: 2.5, totalCost: 12.5 },
    { resourceType: 'storage', usageUnit: 'GB', currency: 'INR', totalUsage: 3, totalCost: 7.5 },
  ],
  usageTrend: [{ date: '2026-11-02', records: 2 }],
  usageOverTime: [
    { date: '2026-11-02', resourceType: 'compute', usageUnit: 'GB', totalUsage: 2.5 },
    { date: '2026-11-02', resourceType: 'storage', usageUnit: 'GB', totalUsage: 3 },
  ],
  spendingTrend: [
    { date: '2026-11-02', currency: 'INR', totalCost: 20 },
  ],
  activeResources: 2,
  utilizationPercent: null,
}

function renderDashboard() {
  return render(<MemoryRouter><Dashboard /></MemoryRouter>)
}

describe('Dashboard analytics', () => {
  beforeEach(() => {
    request.mockReset()
    download.mockReset()
  })

  afterEach(cleanup)

  it('renders usage and spend returned by the organization analytics API', async () => {
    request.mockResolvedValue(populatedAnalytics)

    renderDashboard()

    expect(await screen.findByText('5.5 GB')).toBeTruthy()
    expect(screen.getByText(/₹20\.00/)).toBeTruthy()
    expect(screen.getAllByText(/Compute/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Named resources with recorded usage').parentElement?.textContent).toContain('2')
    expect(screen.getByRole('heading', { name: 'Usage overview' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Resource consumption' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Spending trend' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Resource distribution' })).toBeTruthy()
    expect(screen.getByLabelText('Usage chart series')).toBeTruthy()
    expect(screen.getByLabelText('Spending chart currency')).toBeTruthy()
    expect(request.mock.calls[0][0]).toMatch(/^\/dashboard\?startDate=\d{4}-\d{2}-\d{2}&endDate=\d{4}-\d{2}-\d{2}$/)
  })

  it('shows zero usage and empty states when the organization has no records', async () => {
    request.mockResolvedValue({
      ...populatedAnalytics,
      resourceConsumption: [],
      usageTrend: [],
      usageOverTime: [],
      spendingTrend: [],
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

  it('applies the selected resource type to dashboard and comparison requests', async () => {
    request.mockResolvedValue(populatedAnalytics)

    renderDashboard()
    await screen.findByText('5.5 GB')
    fireEvent.change(screen.getByLabelText('Resource type'), { target: { value: 'compute' } })

    await waitFor(() => {
      expect(request.mock.calls.some(([path]) =>
        path.startsWith('/dashboard?') && path.includes('resourceType=compute'),
      )).toBe(true)
      expect(request.mock.calls.some(([path]) =>
        path.startsWith('/analytics/usage-comparison?') && path.includes('resourceType=compute'),
      )).toBe(true)
    })
  })

  it('refetches only resource details when the resource table sort changes', async () => {
    request.mockResolvedValue(populatedAnalytics)

    renderDashboard()
    await screen.findByText('5.5 GB')
    const dashboardRequestCount = request.mock.calls.filter(([path]) => path.startsWith('/dashboard?')).length

    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'cost' } })

    await waitFor(() => expect(request.mock.calls.some(([path]) =>
      path.startsWith('/analytics/resource-details?') && path.includes('sortBy=cost'),
    )).toBe(true))
    expect(request.mock.calls.filter(([path]) => path.startsWith('/dashboard?')).length).toBe(dashboardRequestCount)
  })

  it('keeps dashboard analytics visible when an auxiliary comparison API fails', async () => {
    request.mockImplementation(async (path) => {
      if (path.startsWith('/analytics/usage-comparison')) {
        throw new Error('Usage comparison unavailable')
      }
      return populatedAnalytics
    })

    renderDashboard()

    expect(await screen.findByText('5.5 GB')).toBeTruthy()
    expect(await screen.findByText('Usage comparison unavailable')).toBeTruthy()
  })

  it('downloads a CSV using the selected date and resource filters', async () => {
    request.mockResolvedValue(populatedAnalytics)
    download.mockResolvedValue(undefined)

    renderDashboard()
    await screen.findByText('5.5 GB')
    fireEvent.change(screen.getByLabelText('Resource type'), { target: { value: 'compute' } })
    await waitFor(() => expect(request.mock.calls.some(([path]) =>
      path.startsWith('/dashboard?') && path.includes('resourceType=compute'),
    )).toBe(true))
    await waitFor(() => expect(screen.getByRole('button', { name: /export csv/i }).getAttribute('disabled')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: /export csv/i }))

    await waitFor(() => expect(download).toHaveBeenCalledOnce())
    expect(download.mock.calls[0][0]).toContain('format=csv')
    expect(download.mock.calls[0][0]).toContain('resourceType=compute')
    expect(download.mock.calls[0][1]).toMatch(/^ledgerguard-resource-analytics-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})
