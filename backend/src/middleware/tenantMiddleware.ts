import type { NextFunction, Response } from 'express'
import type { AuthenticatedRequest } from './authMiddleware.js'
import { getTenantConnection, TenantConnectionUnavailableError } from '../services/tenantConnectionService.js'

export interface TenantRequest extends AuthenticatedRequest {
  tenantConnection?: Awaited<ReturnType<typeof getTenantConnection>>
}

export async function requireTenant(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  const organizationId = req.auth?.organizationId
  if (!organizationId) {
    res.status(401).json({ message: 'Authentication required' })
    return
  }

  let connection: TenantRequest['tenantConnection']
  try {
    connection = await getTenantConnection(organizationId)
  } catch (error) {
    if (error instanceof TenantConnectionUnavailableError) {
      console.error('Unable to select organization database:', error.message)
      res.status(503).json({ message: 'Organization database is unavailable' })
      return
    }

    next(error)
    return
  }

  req.tenantConnection = connection
  next()
}
