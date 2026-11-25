import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import type { Response } from 'express'
import {
  requireAuth,
  type AuthenticatedRequest,
} from '../src/middleware/authMiddleware.js'
import { getJwtSecret } from '../src/config/security.js'

const secret = 'middleware-test-secret-with-at-least-32-characters'
const claims = {
  userId: 'user-1',
  organizationId: '00000000-0000-4000-8000-000000000001',
  role: 'owner',
}

function invoke(token?: string) {
  const req = {
    cookies: token ? { ledgerguard_session: token } : {},
  } as AuthenticatedRequest
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    clearCookie: vi.fn(),
  } as unknown as Response
  const next = vi.fn()

  requireAuth(req, res, next)
  return { req, res, next }
}

describe('JWT authentication middleware', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', secret)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('accepts a signed, unexpired token with the required claims', () => {
    const token = jwt.sign(claims, secret, {
      algorithm: 'HS256',
      expiresIn: '1h',
    })

    const { req, next } = invoke(token)

    expect(next).toHaveBeenCalledOnce()
    expect(req.auth).toEqual(claims)
  })

  it.each([
    ['invalid signature', 'not-a-valid-token'],
    ['expired token', jwt.sign(claims, secret, { expiresIn: -1 })],
    ['token without expiration', jwt.sign(claims, secret)],
    ['token with a non-UUID organization', jwt.sign({ ...claims, organizationId: 'org-1' }, secret, { expiresIn: '1h' })],
    ['token signed with a different algorithm', jwt.sign(claims, secret, { algorithm: 'HS512', expiresIn: '1h' })],
  ])('rejects an %s', (_description, token) => {
    const { res, next } = invoke(token)

    expect(next).not.toHaveBeenCalled()
    expect(res.clearCookie).toHaveBeenCalledWith('ledgerguard_session', { path: '/' })
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('rejects a missing session cookie', () => {
    const { res, next } = invoke()

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ message: 'Authentication required' })
  })

  it('requires a JWT secret with at least 32 characters', () => {
    vi.stubEnv('JWT_SECRET', 'too-short')

    expect(() => getJwtSecret()).toThrow('JWT_SECRET must be set')
  })
})
