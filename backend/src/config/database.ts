import mongoose from 'mongoose'

export async function connectDatabase(): Promise<void> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is required')

  mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error:', error)
  })

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
  console.info('Connected to MongoDB')
}