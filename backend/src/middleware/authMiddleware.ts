import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../config/security.js'

const organizationIdPattern = /^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i
const userRoles = new Set(['owner', 'admin', 'member'])

export interface AuthPayload {
  userId: string
  organizationId: string
  role: string
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthPayload
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token: unknown = req.cookies?.ledgerguard_session
  if (typeof token !== 'string' || !token) {
    res.status(401).json({ message: 'Authentication required' })
    return
  }

  const secret = getJwtSecret()
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] })
    if (
      typeof payload === 'string'
      || typeof payload.userId !== 'string'
      || typeof payload.organizationId !== 'string'
      || typeof payload.role !== 'string'
      || !payload.userId
      || !organizationIdPattern.test(payload.organizationId)
      || !userRoles.has(payload.role)
      || typeof payload.exp !== 'number'
      || !Number.isFinite(payload.exp)
    ) {
      throw new Error('Invalid token')
    }

    req.auth = {
      userId: payload.userId,
      organizationId: payload.organizationId,
      role: payload.role,
    }
    next()
  } catch {
    res.clearCookie('ledgerguard_session', { path: '/' })
    res.status(401).json({ message: 'Session is invalid or expired' })
  }
}