import { Router } from 'express'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireTenant, type TenantRequest } from '../middleware/tenantMiddleware.js'
import { resourceTypes, type ResourceType } from '../models/UsageRecord.js'
import {
  getBillingInsights,
  getResourceDetails,
  getSpendingComparison,
  getUsageComparison,
} from '../services/analyticsService.js'

const analyticsRoutes = Router()
const dayMilliseconds = 24 * 60 * 60 * 1000
const allowedResourceParameters = new Set(['startDate', 'endDate', 'resourceType', 'sortBy', 'order', 'page', 'limit', 'format'])
const allowedComparisonParameters = new Set(['startDate', 'endDate', 'resourceType'])
const maximumCsvRows = 10_000

class InvalidAnalyticsRequestError extends Error {}

function parseDateParameter(value: unknown, parameterName: string): Date | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidAnalyticsRequestError(`${parameterName} must be a date in YYYY-MM-DD format`)
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new InvalidAnalyticsRequestError(`${parameterName} must be a valid calendar date`)
  }
  return date
}

function parseResourceType(value: unknown): ResourceType | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !resourceTypes.some((resourceType) => resourceType === value)) {
    throw new InvalidAnalyticsRequestError(`resourceType must be one of: ${resourceTypes.join(', ')}`)
  }
  return value as ResourceType
}

function parsePositiveInteger(value: unknown, name: string, defaultValue: number, maximum: number): number {
  if (value === undefined) return defaultValue
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new InvalidAnalyticsRequestError(`${name} must be a positive whole number`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new InvalidAnalyticsRequestError(`${name} must not exceed ${maximum}`)
  }
  return parsed
}

function csvField(value: string | number | Date): string {
  let text = value instanceof Date ? value.toISOString() : String(value)
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

function resourceDetailsCsv(data: Awaited<ReturnType<typeof getResourceDetails>>['data']): string {
  const rows = [
    ['Resource name', 'Resource type', 'Usage amount', 'Usage unit', 'Cost', 'Currency', 'Recorded at'],
    ...data.map((resource) => [
      resource.resourceName,
      resource.resourceType,
      resource.usageAmount,
      resource.usageUnit,
      resource.cost,
      resource.currency,
      resource.recordedAt,
    ]),
  ]
  return `${rows.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`
}

function parsePeriod(req: TenantRequest): { startDate: Date; endDate: Date; resourceType?: ResourceType } {
  const unknownParameters = Object.keys(req.query).filter((key) => !allowedComparisonParameters.has(key))
  if (unknownParameters.length > 0) {
    throw new InvalidAnalyticsRequestError(`Unsupported query parameter: ${unknownParameters[0]}`)
  }
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)
  const endDate = parseDateParameter(req.query.endDate, 'endDate') ?? today
  const startDate = parseDateParameter(req.query.startDate, 'startDate')
    ?? new Date(endDate.getTime() - 29 * dayMilliseconds)
  if (startDate > endDate) {
    throw new InvalidAnalyticsRequestError('startDate must be on or before endDate')
  }
  return {
    startDate,
    endDate: new Date(endDate.getTime() + dayMilliseconds),
    resourceType: parseResourceType(req.query.resourceType),
  }
}

analyticsRoutes.use(requireAuth, requireTenant)

analyticsRoutes.get('/resource-details', async (req: TenantRequest, res) => {
  if (!req.tenantConnection || !req.auth?.organizationId) {
    res.status(503).json({ message: 'Organization database is unavailable' })
    return
  }
  try {
    const unknownParameters = Object.keys(req.query).filter((key) => !allowedResourceParameters.has(key))
    if (unknownParameters.length > 0) {
      throw new InvalidAnalyticsRequestError(`Unsupported query parameter: ${unknownParameters[0]}`)
    }
    const startDate = parseDateParameter(req.query.startDate, 'startDate')
    const inclusiveEndDate = parseDateParameter(req.query.endDate, 'endDate')
    if (startDate && inclusiveEndDate && startDate > inclusiveEndDate) {
      throw new InvalidAnalyticsRequestError('startDate must be on or before endDate')
    }
    const resourceType = parseResourceType(req.query.resourceType)
    const sortBy = req.query.sortBy === undefined ? 'recordedAt' : req.query.sortBy
    if (typeof sortBy !== 'string' || !['usage', 'cost', 'recordedAt'].includes(sortBy)) {
      throw new InvalidAnalyticsRequestError('sortBy must be usage, cost, or recordedAt')
    }
    const order = req.query.order === undefined ? 'desc' : req.query.order
    if (typeof order !== 'string' || !['asc', 'desc'].includes(order)) {
      throw new InvalidAnalyticsRequestError('order must be asc or desc')
    }
    const format = req.query.format
    if (format !== undefined && format !== 'csv') {
      throw new InvalidAnalyticsRequestError('format must be csv when provided')
    }
    if (format === 'csv' && (req.query.page !== undefined || req.query.limit !== undefined)) {
      throw new InvalidAnalyticsRequestError('page and limit cannot be used when exporting CSV')
    }

    const result = await getResourceDetails(req.tenantConnection, {
      organizationId: req.auth.organizationId,
      ...(resourceType ? { resourceType } : {}),
      ...(startDate ? { startDate } : {}),
      ...(inclusiveEndDate ? { endDate: new Date(inclusiveEndDate.getTime() + dayMilliseconds) } : {}),
      sortBy: sortBy as 'usage' | 'cost' | 'recordedAt',
      order: order as 'asc' | 'desc',
      page: format === 'csv' ? 1 : parsePositiveInteger(req.query.page, 'page', 1, 1_000_000),
      limit: format === 'csv' ? maximumCsvRows : parsePositiveInteger(req.query.limit, 'limit', 10, 100),
    })
    if (format === 'csv') {
      if (result.total > maximumCsvRows) {
        res.status(413).json({ message: `CSV export is limited to ${maximumCsvRows.toLocaleString('en-US')} resource rows; narrow the date range or resource filter` })
        return
      }
      const start = typeof req.query.startDate === 'string' ? req.query.startDate : 'all'
      const end = typeof req.query.endDate === 'string' ? req.query.endDate : 'all'
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="ledgerguard-resource-analytics-${start}-${end}.csv"`)
      res.send(resourceDetailsCsv(result.data))
      return
    }
    res.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof InvalidAnalyticsRequestError) {
      res.status(400).json({ message: error.message })
      return
    }
    throw error
  }
})

analyticsRoutes.get('/usage-comparison', async (req: TenantRequest, res) => {
  if (!req.tenantConnection || !req.auth?.organizationId) {
    res.status(503).json({ message: 'Organization database is unavailable' })
    return
  }
  try {
    const period = parsePeriod(req)
    const data = await getUsageComparison(req.tenantConnection, {
      organizationId: req.auth.organizationId,
      ...period,
    })
    res.json({ success: true, data })
  } catch (error) {
    if (error instanceof InvalidAnalyticsRequestError) {
      res.status(400).json({ message: error.message })
      return
    }
    throw error
  }
})

analyticsRoutes.get('/spending-comparison', async (req: TenantRequest, res) => {
  if (!req.tenantConnection || !req.auth?.organizationId) {
    res.status(503).json({ message: 'Organization database is unavailable' })
    return
  }
  try {
    const period = parsePeriod(req)
    const data = await getSpendingComparison(req.tenantConnection, {
      organizationId: req.auth.organizationId,
      ...period,
    })
    res.json({ success: true, data })
  } catch (error) {
    if (error instanceof InvalidAnalyticsRequestError) {
      res.status(400).json({ message: error.message })
      return
    }
    throw error
  }
})

analyticsRoutes.get('/billing-insights', async (req: TenantRequest, res) => {
  if (!req.tenantConnection || !req.auth?.organizationId) {
    res.status(503).json({ message: 'Organization database is unavailable' })
    return
  }
  try {
    const period = parsePeriod(req)
    const data = await getBillingInsights(req.tenantConnection, {
      organizationId: req.auth.organizationId,
      startDate: period.startDate,
      endDate: period.endDate,
      ...(period.resourceType ? { resourceType: period.resourceType } : {}),
    })
    res.json({ success: true, data })
  } catch (error) {
    if (error instanceof InvalidAnalyticsRequestError) {
      res.status(400).json({ message: error.message })
      return
    }
    throw error
  }
})

export default analyticsRoutes
