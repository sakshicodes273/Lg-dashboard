import mongoose from 'mongoose'
import { closeAllTenantConnections } from '../utils/connectionManager.js'

export function getMongoUri(): string {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is required')
  return uri
}

export async function connectDatabase(): Promise<void> {
  mongoose.connection.on('error', (error) => console.error('MongoDB connection error:', error))
  mongoose.connection.on('disconnected', () => console.error('MongoDB connection disconnected'))

  await mongoose.connect(getMongoUri(), { serverSelectionTimeoutMS: 10000 })
  console.info(`Connected to MongoDB database "${mongoose.connection.name}"`)
}

export async function closeDatabase(): Promise<void> {
  const errors: unknown[] = []

  try {
    await closeAllTenantConnections()
  } catch (error) {
    errors.push(error)
  }

  try {
    await mongoose.disconnect()
  } catch (error) {
    errors.push(error)
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, 'One or more database connections failed to close')
  }
}
