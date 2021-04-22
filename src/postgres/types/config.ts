import { Logger } from '../../types/logger'
import { MessageDataSerializer } from '../../types/serialization'

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
  notifier?: NotifierConfig
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
   * Serializer to use. All data is stored as JSON, but you can plug in your own serializer for this,
   * like if you wanted to revive dates as actual `Date` instances.
   */
  serializer?: MessageDataSerializer
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
  /**
   * Optional override to connect to a different host for receiving notifications.
   * Useful when using PgBouncer primarily and you want to connect straight to the
   * source in order to take advantage of `pg_notify`.
   */
  host?: string
  /**
   * Optional override to connect to a different port for receiving notifications.
   * Useful when using PgBouncer primarily and you want to connect straight to the
   * source in order to take advantage of `pg_notify`.
   */
  port?: string | number
  /**
   * Optional override to connect as a different user for receiving notifications.
   * Useful when using PgBouncer and you want to use a session-pool configuration
   * to take advantage of `pg_notify`. That way, you can use transaction pooling for
   * everything else.
   */
  user?: string
  /**
   * Optional override for the password.
   */
  password?: string
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
  ssl?: boolean
  user: string
  password: string
  database: string
  /**
   * Pool minimum size.
   */
  min?: number
  /**
   * Pool maximum size.
   */
  max?: number
  /**
   * Idle timeout (in milliseconds).
   */
  idleTimeoutMillis?: number
}
