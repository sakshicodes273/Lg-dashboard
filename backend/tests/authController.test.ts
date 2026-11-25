import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import type { Request, Response } from 'express'

const mocks = vi.hoisted(() => ({
  userExists: vi.fn(),
  userCreate: vi.fn(),
  userFindOne: vi.fn(),
  organizationCreate: vi.fn(),
  organizationDeleteOne: vi.fn(),
}))

vi.mock('../src/models/User.js', () => ({
  User: {
    exists: mocks.userExists,
    create: mocks.userCreate,
    findOne: mocks.userFindOne,
  },
}))

vi.mock('../src/models/Organization.js', () => ({
  Organization: {
    create: mocks.organizationCreate,
    deleteOne: mocks.organizationDeleteOne,
  },
}))

import { login, register } from '../src/controllers/authController.js'

const secret = 'auth-controller-test-secret-with-at-least-32-characters'
const organizationId = '00000000-0000-4000-8000-000000000002'

function response() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    cookie: vi.fn(),
  }
  res.status.mockReturnValue(res)
  res.json.mockReturnValue(res)
  res.cookie.mockReturnValue(res)
  return res
}

describe('authentication controllers', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', secret)
    mocks.userExists.mockReset().mockResolvedValue(null)
    mocks.userCreate.mockReset()
    mocks.userFindOne.mockReset()
    mocks.organizationCreate.mockReset()
    mocks.organizationDeleteOne.mockReset().mockResolvedValue({ deletedCount: 1 })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('logs in with a bcrypt-hashed password and returns no hash or token in the response body', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 12)
    const user = {
      _id: 'user-1',
      name: 'Ledger Owner',
      email: 'owner@example.com',
      password: passwordHash,
      organizationId,
      role: 'owner',
    }
    const select = vi.fn().mockResolvedValue(user)
    mocks.userFindOne.mockReturnValue({ select })
    const res = response()

    await login(
      { body: { email: ' OWNER@example.com ', password: 'correct-password' } } as Request,
      res as unknown as Response,
    )

    expect(mocks.userFindOne).toHaveBeenCalledWith({ email: 'owner@example.com' })
    expect(select).toHaveBeenCalledWith('+password')
    expect(res.cookie).toHaveBeenCalledWith(
      'ledgerguard_session',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
    )
    const token = res.cookie.mock.calls[0][1] as string
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] })
    expect(payload).toMatchObject({ userId: 'user-1', organizationId, role: 'owner' })
    expect((payload as jwt.JwtPayload).exp).toEqual(expect.any(Number))
    expect(res.json).toHaveBeenCalledWith({
      user: {
        id: 'user-1',
        name: 'Ledger Owner',
        email: 'owner@example.com',
        organizationId,
        role: 'owner',
      },
    })
  })

  it('rejects incorrect credentials without issuing a session', async () => {
    const user = {
      _id: 'user-1',
      name: 'Ledger Owner',
      email: 'owner@example.com',
      password: await bcrypt.hash('correct-password', 12),
      organizationId,
      role: 'owner',
    }
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(user),
    })
    const res = response()

    await login(
      { body: { email: user.email, password: 'incorrect-password' } } as Request,
      res as unknown as Response,
    )

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ message: 'Email or password is incorrect' })
    expect(res.cookie).not.toHaveBeenCalled()
  })

  it('stores a bcrypt hash at registration and returns only the public user', async () => {
    mocks.organizationCreate.mockResolvedValue({ organizationId })
    mocks.userCreate.mockImplementation(async (input: Record<string, unknown>) => ({
      _id: 'user-2',
      name: input.name,
      email: input.email,
      password: input.password,
      organizationId: input.organizationId,
      role: input.role,
    }))
    const res = response()

    await register(
      {
        body: {
          name: 'New Owner',
          email: 'new-owner@example.com',
          password: 'a-secure-password',
          organizationName: 'New Organization',
        },
      } as Request,
      res as unknown as Response,
    )

    const savedUser = mocks.userCreate.mock.calls[0][0] as { password: string }
    expect(savedUser.password).not.toBe('a-secure-password')
    expect(await bcrypt.compare('a-secure-password', savedUser.password)).toBe(true)
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({
      user: {
        id: 'user-2',
        name: 'New Owner',
        email: 'new-owner@example.com',
        organizationId,
        role: 'owner',
      },
    })
  })

  it('rejects non-object auth bodies without querying accounts', async () => {
    const res = response()

    await register({ body: null } as Request, res as unknown as Response)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(mocks.userExists).not.toHaveBeenCalled()
  })

  it('rejects malformed login emails before querying accounts', async () => {
    const res = response()

    await login(
      { body: { email: 'not-an-email', password: 'some-password' } } as Request,
      res as unknown as Response,
    )

    expect(res.status).toHaveBeenCalledWith(400)
    expect(mocks.userFindOne).not.toHaveBeenCalled()
  })
})
