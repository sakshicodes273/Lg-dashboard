import type { Connection } from 'mongoose'

const connections = new Map<string, Promise<Connection>>()
let shutdownRequested = false

export function getOrCreateConnection(
  key: string,
  createConnection: () => Connection,
): Promise<Connection> {
  if (shutdownRequested) {
    throw new Error('Database connection manager is shutting down')
  }

  const existingConnection = connections.get(key)
  if (existingConnection) return existingConnection

  let connection: Connection
  try {
    connection = createConnection()
  } catch (error) {
    console.error(`Unable to create MongoDB connection "${key}":`, error)
    throw error
  }

  connection.on('error', (error) => {
    console.error(`MongoDB connection "${key}" error:`, error)
  })
  connection.on('disconnected', () => {
    console.warn(`MongoDB connection "${key}" disconnected`)
  })

  const pendingConnection = connection.asPromise()
    .then(() => {
      console.info(`Connected to MongoDB database "${connection.name}"`)
      return connection
    })
    .catch(async (error: unknown) => {
      if (connections.get(key) === pendingConnection) connections.delete(key)

      console.error(`Unable to connect to MongoDB database "${key}":`, error)
      try {
        await connection.close()
      } catch (closeError) {
        console.error(`Unable to close failed MongoDB connection "${key}":`, closeError)
      }

      throw error
    })

  connections.set(key, pendingConnection)
  return pendingConnection
}

export async function closeAllTenantConnections(): Promise<void> {
  shutdownRequested = true
  const pendingConnections = [...connections.values()]
  const settledConnections = await Promise.allSettled(pendingConnections)
  const errors = settledConnections
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason)
  const connectedConnections = settledConnections
    .filter((result): result is PromiseFulfilledResult<Connection> => result.status === 'fulfilled')
    .map((result) => result.value)

  const closeResults = await Promise.allSettled(
    connectedConnections.map((connection) => connection.close()),
  )
  errors.push(
    ...closeResults
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason),
  )
  connections.clear()

  if (errors.length > 0) {
    throw new AggregateError(errors, 'One or more tenant database connections failed to close')
  }
}
