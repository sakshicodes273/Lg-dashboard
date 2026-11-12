import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthPayload {
  userId: string
  organizationId: string
  role: string
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthPayload
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.ledgerguard_session as string | undefined
  const secret = process.env.JWT_SECRET
  if (!token || !secret) {
    res.status(401).json({ message: 'Authentication required' })
    return
  }

  try {
    const payload = jwt.verify(token, secret)
    if (
      typeof payload === 'string'
      || typeof payload.userId !== 'string'
      || typeof payload.organizationId !== 'string'
      || typeof payload.role !== 'string'
      || !payload.userId
      || !payload.organizationId
      || !payload.role
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