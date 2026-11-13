import mongoose, { type Connection } from 'mongoose'
import { getMongoUri } from '../config/database.js'
import { getOrCreateConnection } from '../utils/connectionManager.js'

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

export async function getTenantConnection(organizationId: string): Promise<Connection> {
  const databaseName = getTenantDatabaseName(organizationId)
  try {
    return await getOrCreateConnection(databaseName, () =>
      mongoose.createConnection(getMongoUri(), {
        dbName: databaseName,
        serverSelectionTimeoutMS: 10000,
      }),
    )
  } catch (error) {
    if (error instanceof TenantConnectionUnavailableError) throw error
    throw new TenantConnectionUnavailableError('Unable to connect to the organization database')
  }
}
