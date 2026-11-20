export interface User {
  id: string
  name: string
  email: string
  organizationId: string
  role: 'owner' | 'admin' | 'member'
}