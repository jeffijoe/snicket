import { PgStreamStoreConfig } from 'snicket/lib/postgres'
import { createConsoleLogger } from 'snicket'

export const streamStoreConfig: PgStreamStoreConfig = {
  logger: createConsoleLogger('info'),
  // Use the Postgres notification system for the subscription.
  // This is faster than the polling notifier.
  notifier: {
    type: 'pg-notify',
    keepAliveInterval: 1000 * 60 * 5
  },
  pg: {
    host: 'localhost',
    user: 'postgres',
    password: '',
    database: 'inventory',
    port: 20091
  }
}
