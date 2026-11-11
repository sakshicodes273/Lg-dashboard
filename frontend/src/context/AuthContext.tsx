import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { apiRequest } from '../services/api'
import type { User } from '../types/auth'

interface AuthContextValue {
  user: User | null
  organizationName: string
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (name: string, email: string, password: string, organizationName: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [organizationName, setOrganizationName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiRequest<{ user: User; organization: { name: string } | null }>('/auth/me')
      .then(({ user: currentUser, organization }) => {
        setUser(currentUser)
        setOrganizationName(organization?.name ?? '')
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  async function signIn(email: string, password: string) {
    const result = await apiRequest<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setUser(result.user)
    setOrganizationName('')
  }

  async function signUp(name: string, email: string, password: string, orgName: string) {
    const result = await apiRequest<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, organizationName: orgName }),
    })
    setUser(result.user)
    setOrganizationName(orgName)
  }

  async function signOut() {
    await apiRequest<void>('/auth/logout', { method: 'POST' })
    setUser(null)
    setOrganizationName('')
  }

  return (
    <AuthContext.Provider value={{ user, organizationName, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}