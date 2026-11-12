import mongoose, { type Connection } from 'mongoose'

const organizationIdPattern = /^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i

export class TenantConnectionUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TenantConnectionUnavailableError'
  }
}

function getTenantDatabaseName(organizationId: string): string {
  if (!organizationIdPattern.test(organizationId)) {
    throw new TenantConnectionUnavailableError('The authenticated organization ID is invalid')
  }

  return `tenant_${organizationId.replaceAll('-', '').toLowerCase()}`
}

export function getTenantConnection(organizationId: string): Connection {
  if (mongoose.connection.readyState !== 1) {
    throw new TenantConnectionUnavailableError('The database connection is not ready')
  }

  const databaseName = getTenantDatabaseName(organizationId)
  return mongoose.connection.useDb(databaseName, { useCache: true })
}
