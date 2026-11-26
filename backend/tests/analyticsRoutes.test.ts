import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'

const mocks = vi.hoisted(() => ({
  getResourceDetails: vi.fn(),
  getDashboardAnalytics: vi.fn(),
  tenantConnection: {},
}))

vi.mock('../src/services/analyticsService.js', () => ({
  getDashboardAnalytics: mocks.getDashboardAnalytics,
  getResourceDetails: mocks.getResourceDetails,
  getUsageComparison: vi.fn(),
  getSpendingComparison: vi.fn(),
  getBillingInsights: vi.fn(),
}))

vi.mock('../src/services/tenantConnectionService.js', () => ({
  TenantConnectionUnavailableError: class TenantConnectionUnavailableError extends Error {},
  getTenantConnection: vi.fn(async () => mocks.tenantConnection),
}))

import app from '../src/app.js'

const secret = 'analytics-route-test-secret-with-at-least-32-characters'
const organizationId = '00000000-0000-4000-8000-000000000001'
const resourcePage = {
  data: [{
    resourceName: '=1+1',
    resourceType: 'compute',
    usageAmount: 12,
    usageUnit: 'hours',
    cost: 3.5,
    currency: 'USD',
    recordedAt: new Date('2026-11-12T10:00:00.000Z'),
  }],
  page: 1,
  limit: 10,
  total: 1,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
}

describe('analytics resource details route', () => {
  let server: ReturnType<typeof app.listen>
  let baseUrl = ''
  let token = ''

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', secret)
    token = jwt.sign(
      { userId: 'user-1', organizationId, role: 'owner' },
      secret,
      { expiresIn: '7d' },
    )
    mocks.getResourceDetails.mockReset().mockResolvedValue(resourcePage)
    mocks.getDashboardAnalytics.mockReset().mockResolvedValue({
      resourceConsumption: [],
      usageTrend: [],
      usageOverTime: [],
      spendingTrend: [],
      activeResources: 0,
      utilizationPercent: null,
    })
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
    vi.unstubAllEnvs()
  })

  it('exports filtered organization resource details as formula-safe CSV', async () => {
    const response = await fetch(
      `${baseUrl}/api/analytics/resource-details?startDate=2026-11-01&endDate=2026-11-30&resourceType=compute&sortBy=cost&order=asc&format=csv`,
      { headers: { Cookie: `ledgerguard_session=${token}` } },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toContain('attachment;')
    const csv = await response.text()
    expect(csv).toContain('"Resource name","Resource type","Usage amount"')
    expect(csv).toContain('"\'=1+1"')
    expect(csv).toContain('"2026-11-12T10:00:00.000Z"')
    expect(mocks.getResourceDetails).toHaveBeenCalledWith(mocks.tenantConnection, {
      organizationId,
      resourceType: 'compute',
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2026-12-01T00:00:00.000Z'),
      sortBy: 'cost',
      order: 'asc',
      page: 1,
      limit: 10_000,
    })
  })

  it('keeps the existing paginated JSON response and rejects CSV pagination', async () => {
    const jsonResponse = await fetch(`${baseUrl}/api/analytics/resource-details`, {
      headers: { Cookie: `ledgerguard_session=${token}` },
    })
    expect(jsonResponse.status).toBe(200)
    expect(await jsonResponse.json()).toMatchObject({
      success: true,
      data: [{ ...resourcePage.data[0], recordedAt: resourcePage.data[0].recordedAt.toISOString() }],
    })

    const invalidResponse = await fetch(
      `${baseUrl}/api/analytics/resource-details?format=csv&page=2`,
      { headers: { Cookie: `ledgerguard_session=${token}` } },
    )
    expect(invalidResponse.status).toBe(400)
    expect(mocks.getResourceDetails).toHaveBeenCalledTimes(1)
  })

  it('requires authentication and reports when the export row limit is exceeded', async () => {
    const unauthenticated = await fetch(`${baseUrl}/api/analytics/resource-details?format=csv`)
    expect(unauthenticated.status).toBe(401)
    expect(mocks.getResourceDetails).not.toHaveBeenCalled()

    mocks.getResourceDetails.mockResolvedValueOnce({ ...resourcePage, total: 10_001 })
    const response = await fetch(`${baseUrl}/api/analytics/resource-details?format=csv`, {
      headers: { Cookie: `ledgerguard_session=${token}` },
    })
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ message: expect.stringContaining('10,000') })
  })

  it('applies the selected resource type to dashboard queries', async () => {
    const response = await fetch(
      `${baseUrl}/api/dashboard?startDate=2026-11-01&endDate=2026-11-30&resourceType=storage`,
      { headers: { Cookie: `ledgerguard_session=${token}` } },
    )

    expect(response.status).toBe(200)
    expect(mocks.getDashboardAnalytics).toHaveBeenCalledWith(mocks.tenantConnection, {
      organizationId,
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2026-12-01T00:00:00.000Z'),
      resourceType: 'storage',
    })

    const invalidResponse = await fetch(
      `${baseUrl}/api/dashboard?resourceType=other`,
      { headers: { Cookie: `ledgerguard_session=${token}` } },
    )
    expect(invalidResponse.status).toBe(400)
    expect(mocks.getDashboardAnalytics).toHaveBeenCalledTimes(1)

    const spoofedOrganization = await fetch(
      `${baseUrl}/api/dashboard?organizationId=00000000-0000-4000-8000-000000000002`,
      { headers: { Cookie: `ledgerguard_session=${token}` } },
    )
    expect(spoofedOrganization.status).toBe(400)
    expect(mocks.getDashboardAnalytics).toHaveBeenCalledTimes(1)
  })
})
