import mongoose from 'mongoose'

import { env } from '../config/env.js'

export async function connectToDatabase(): Promise<void> {
  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err)
  })
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected')
  })

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
  })

  // Build the unique/TTL indexes declared on the schemas before serving traffic.
  // Without this the merge logic's uniqueness guarantees are not yet enforced.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()))

  console.log(`[db] connected to MongoDB (${mongoose.connection.name})`)
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect()
}
