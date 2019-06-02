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
   * If `true`, waits for a scavenge to complete before returning from `append`.
   * This does not affect setting a stream's metadata, that is always awaited.
   * Defaults to `false`.
   */
  scavengeSynchronously?: boolean
  /**
   * Configuration related to reading streams
   */
  reading?: Partial<ReadingConfig>
  /**
   * Logger.
   */
  logger?: Logger
  /**
   * Used when inserting messages to figure out what the time is.
   * If it returns `null`, the DB server time in UTC is used.
   * This is here for testing purposes.
   */
  getCurrentTime?: () => Date | null
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
   * Default is 500 (0.5 seconds)
   */
  pollingInterval?: number
}

/**
 * Settings related to reading streams.
 */
export interface ReadingConfig {
  /**
   * If true, will filter out expired messages
   */
  filterExpiredMessages: boolean
  /**
   * If filtering is enabled, we need to use stream metadata to figure out
   * what messages are expired. To avoid spamming the DB with requests,
   * we can cache the metadata.
   *
   * The value is in seconds and defaults to 1 minute.
   */
  metadataCacheTtl: number
}

/**
 * Options for connecting to Postgres.
 */
export interface DatabaseConnectionOptions {
  schema?: string
  dropIfTest?: boolean
  host: string
  port: string | number
  user: string
  password: string
  database: string
  ssl?: boolean
  /**
   * Pool minimum size.
   */
  min?: number
  /**
   * Pool maximum size.
   */
  max?: number
}
