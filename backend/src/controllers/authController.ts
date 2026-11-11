import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { Organization } from '../models/Organization.js'
import { User } from '../models/User.js'
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js'

const sessionCookie = 'ledgerguard_session'
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000

function setSessionCookie(res: Response, token: string): void {
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: sessionDurationMs,
  })
}

function publicUser(user: { _id: unknown; name: string; email: string; organizationId: string; role: string }) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    organizationId: user.organizationId,
    role: user.role,
  }
}

export async function register(req: Request, res: Response): Promise<void> {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  const organizationName = typeof req.body.organizationName === 'string' ? req.body.organizationName.trim() : ''

  if (name.length < 2 || name.length > 120) {
    res.status(400).json({ message: 'Name must be between 2 and 120 characters' })
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    res.status(400).json({ message: 'Enter a valid email address' })
    return
  }
  if (password.length < 10 || password.length > 128) {
    res.status(400).json({ message: 'Password must be between 10 and 128 characters' })
    return
  }
  if (organizationName.length < 2 || organizationName.length > 120) {
    res.status(400).json({ message: 'Organization name must be between 2 and 120 characters' })
    return
  }

  const existingUser = await User.exists({ email })
  if (existingUser) {
    res.status(409).json({ message: 'An account with this email already exists' })
    return
  }

  let organizationId: string | undefined
  try {
    const organization = await Organization.create({ name: organizationName, organizationId: randomUUID() })
    organizationId = organization.organizationId
    const user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 12),
      organizationId,
      role: 'owner',
    })

    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('JWT_SECRET is required')
    const token = jwt.sign(
      { userId: String(user._id), organizationId, role: user.role },
      secret,
      { expiresIn: '7d' },
    )
    setSessionCookie(res, token)
    res.status(201).json({ user: publicUser(user) })
  } catch (error) {
    if (organizationId) await Organization.deleteOne({ organizationId }).catch(() => undefined)
    throw error
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  if (!email || !password) {
    res.status(400).json({ message: 'Email and password are required' })
    return
  }

  const user = await User.findOne({ email }).select('+password')
  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ message: 'Email or password is incorrect' })
    return
  }

  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is required')
  const token = jwt.sign(
    { userId: String(user._id), organizationId: user.organizationId, role: user.role },
    secret,
    { expiresIn: '7d' },
  )
  setSessionCookie(res, token)
  res.json({ user: publicUser(user) })
}

export async function currentUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = await User.findById(req.auth?.userId)
  if (!user) {
    res.clearCookie(sessionCookie, { path: '/' })
    res.status(401).json({ message: 'Session is invalid or expired' })
    return
  }
  const organization = await Organization.findOne({ organizationId: user.organizationId })
  res.json({ user: publicUser(user), organization: organization ? { name: organization.name } : null })
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  })
  res.status(204).end()
}