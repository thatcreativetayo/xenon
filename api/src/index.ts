import { createApp } from './app.js'
import { env } from './config/env.js'
import { connectToDatabase, disconnectFromDatabase } from './db/connect.js'

// Registers every model with mongoose before connectToDatabase() builds indexes.
import './models/index.js'

async function main(): Promise<void> {
  await connectToDatabase()

  const app = createApp()
  const server = app.listen(env.port, () => {
    console.log(`[xenon] auth api listening on http://localhost:${env.port}`)
    console.log(`[xenon] google redirect uri: ${env.googleRedirectUri}`)
    console.log(`[xenon] post-login redirect: ${env.postLoginRedirect}`)
  })

  const shutdown = (signal: string) => {
    console.log(`\n[xenon] ${signal} received, shutting down`)
    server.close(() => {
      void disconnectFromDatabase().then(() => process.exit(0))
    })
    // Don't hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref()
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('[xenon] failed to start:', err instanceof Error ? err.message : err)
  process.exit(1)
})
