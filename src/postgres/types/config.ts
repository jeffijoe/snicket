import { Logger } from '../../types/logger'

/**
 * Config for the Postgres Stream Store.
 */
export interface PgStreamStoreConfig {
  /**
   * Postgres connection options.
   */
  pg: DatabaseConnectionOptions
  /**
   * How long to wait with reloading after a gap is detected.
   */
  gapReloadDelay?: number
  /**
   * How many times to reload if there are gaps detected.
   */
  gapReloadTimes?: number
  /**
   * The notififer configuration. Used for subscriptions.
   */
  notifierConfig?: NotifierConfig
  /**
   * Logger.
   */
  logger?: Logger
}

/**
 * Notifier config.
 */
export type NotifierConfig = PgNotifierConfig | PollingNotifierConfig

/**
 * Uses the Postgres notification system for subscriptions.
 *
 * Optionally executes a simple query every `pollingInterval` milliseconds.
 * Useful for PaaS Postgres where idle connections are closed.
 */
export interface PgNotifierConfig {
  type: 'pg-notify'
  /**
   * If specified, starts an interval to keep the connection alive.
   * Value is milliseconds. Recommended: 5 * 60 * 1000 (5 minutes)
   */
  keepAliveInterval?: number
}

/**
 * Uses polling to notify subscribers of new messages.
 */
export interface PollingNotifierConfig {
  type: 'poll'
  /**
   * The polling interval when using the polling notifier.
   */
  pollingInterval?: number
}

/**
 * Options for connecting to Postgres.
 */
export interface DatabaseConnectionOptions {
  schema?: string
  dropIfTest?: boolean
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl?: boolean
}
