import { Router } from 'express'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireTenant, type TenantRequest } from '../middleware/tenantMiddleware.js'
import { resourceTypes, type ResourceType } from '../models/UsageRecord.js'
import { getDashboardAnalytics } from '../services/analyticsService.js'

const dashboardRoutes = Router()
const allowedQueryParameters = new Set(['startDate', 'endDate', 'resourceType'])
const dayMilliseconds = 24 * 60 * 60 * 1000

class InvalidDashboardRequestError extends Error {}

function parseDateParameter(value: unknown, parameterName: string): Date | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidDashboardRequestError(`${parameterName} must be a date in YYYY-MM-DD format`)
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new InvalidDashboardRequestError(`${parameterName} must be a valid calendar date`)
  }
  return date
}

function parseResourceType(value: unknown): ResourceType | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !resourceTypes.some((resourceType) => resourceType === value)) {
    throw new InvalidDashboardRequestError(`resourceType must be one of: ${resourceTypes.join(', ')}`)
  }
  return value as ResourceType
}

dashboardRoutes.use(requireAuth, requireTenant)

dashboardRoutes.get('/', async (req: TenantRequest, res) => {
  if (!req.tenantConnection || !req.auth?.organizationId) {
    res.status(503).json({ message: 'Organization database is unavailable' })
    return
  }

  try {
    const unknownParameters = Object.keys(req.query).filter((key) => !allowedQueryParameters.has(key))
    if (unknownParameters.length > 0) {
      throw new InvalidDashboardRequestError(`Unsupported query parameter: ${unknownParameters[0]}`)
    }

    const endDate = parseDateParameter(req.query.endDate, 'endDate')
      ?? new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)
    const startDate = parseDateParameter(req.query.startDate, 'startDate')
      ?? new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1))
    if (startDate > endDate) {
      throw new InvalidDashboardRequestError('startDate must be on or before endDate')
    }

    const analytics = await getDashboardAnalytics(req.tenantConnection, {
      organizationId: req.auth.organizationId,
      startDate,
      endDate: new Date(endDate.getTime() + dayMilliseconds),
      resourceType: parseResourceType(req.query.resourceType),
    })
    res.json({
      organizationId: req.auth.organizationId,
      period: {
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
      },
      ...analytics,
    })
  } catch (error) {
    if (error instanceof InvalidDashboardRequestError) {
      res.status(400).json({ message: error.message })
      return
    }
    throw error
  }
})

export default dashboardRoutes
