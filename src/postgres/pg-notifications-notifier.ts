import { StreamStoreNotifier } from '../types/subscriptions'
import { DisposedError } from '../errors/errors'
import { Client } from 'pg'
import { Logger } from '../types/logger'
import { DatabaseConnectionOptions } from './types/config'
import { createPostgresClientConfig } from './connection'
import { Guardian } from '../utils/guardian'

/**
 * Creates a Postgres Notifications notifier.
 */
export function createPostgresNotifier(
  pgConfig: DatabaseConnectionOptions,
  logger: Logger,
  keepAliveInterval?: number
): StreamStoreNotifier {
  let _listeners: Array<() => void> = []
  let _disposed = false
  let disposeSubscription: (() => Promise<void>) | null = null
  return {
    listen(cb) {
      DisposedError.assert(!_disposed, 'The notifier has been disposed.')
      _listeners.push(cb)
      disposeSubscription = disposeSubscription || subscribe()
      return () => {
        _listeners.splice(_listeners.indexOf(cb), 1)
      }
    },
    /**
     * Disposes all listeners and closes the connection
     */
    async dispose() {
      DisposedError.assert(
        !_disposed,
        'The notifier has already been disposed.'
      )
      /* istanbul ignore else */
      if (disposeSubscription) {
        await disposeSubscription()
      }
      _disposed = true
      _listeners = []
    },
  }

  /**
   * Subscribes to the notifications feed.
   */
  function subscribe() {
    const guardian = Guardian({
      logger,
      maxRestarts: 10,
      spawn: (controller) => {
        let client: Client | null = null
        let interval: NodeJS.Timeout | null = null
        let intervalPromise: Promise<unknown> = Promise.resolve()
        return {
          name: 'pg-notifications-notifier',
          async startup() {
            const inner = (client = createClient())
            client.addListener('error', controller.onError)
            client.addListener('notification', invokeListeners)
            await client.connect()
            await client.query('LISTEN new_messages')
            logger.trace('pg-notifications-notifier: listener configured')
            controller.resetRestartCount()
            if (keepAliveInterval) {
              interval = setInterval(() => {
                intervalPromise = inner
                  .query('select true')
                  .then(controller.resetRestartCount)
                  .catch(controller.onError)
              }, keepAliveInterval)
            }
          },
          async shutdown() {
            if (interval !== null) {
              clearInterval(interval)
            }
            await intervalPromise
            await (client && client.end())
          },
        }
      },
    })

    guardian.start()
    return () => guardian.dispose()
  }

  /**
   * Invokes the listeners.
   */
  function invokeListeners() {
    for (const i in _listeners) {
      _listeners[i]()
    }
  }

  /**
   * Creates a Postgres client.
   */
  function createClient() {
    return new Client({
      ...createPostgresClientConfig(pgConfig),
      keepAlive: true,
    })
  }
}
