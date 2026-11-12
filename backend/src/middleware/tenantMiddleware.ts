import type { NextFunction, Response } from 'express'
import type { AuthenticatedRequest } from './authMiddleware.js'
import { getTenantConnection, TenantConnectionUnavailableError } from '../services/tenantConnectionService.js'

export interface TenantRequest extends AuthenticatedRequest {
  tenantConnection?: ReturnType<typeof getTenantConnection>
}

export function requireTenant(req: TenantRequest, res: Response, next: NextFunction): void {
  const organizationId = req.auth?.organizationId
  if (!organizationId) {
    res.status(401).json({ message: 'Authentication required' })
    return
  }

  try {
    req.tenantConnection = getTenantConnection(organizationId)
    next()
  } catch (error) {
    if (error instanceof TenantConnectionUnavailableError) {
      console.error('Unable to select organization database:', error.message)
      res.status(503).json({ message: 'Organization database is unavailable' })
      return
    }

    next(error)
  }
}
