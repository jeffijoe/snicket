import { StreamStoreNotifier } from '../types/subscriptions'
import { DisposedError } from '../errors/errors'
import { Client } from 'pg'
import { Logger } from '../types/logger'
import { DatabaseConnectionOptions } from './types/config'
import { createPostgresClientConfig } from './connection'

/**
 * Creates a Postgres Notifications notifier.
 */
export function createPostgresNotifier(
  pgConfig: DatabaseConnectionOptions,
  logger: Logger,
  keepAliveInterval?: number
): StreamStoreNotifier {
  let _listeners: Array<Function> = []
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
    let interval: NodeJS.Timeout | null = null
    let intervalPromise: any = null
    const client = createClient()
    const clientPromise = client
      .connect()
      .then(async () => {
        client.addListener('notification', invokeListeners)
        await client.query('LISTEN new_messages')
        logger.trace('pg-notifications-notifier: listener configured')
        if (keepAliveInterval) {
          interval = setInterval(() => {
            intervalPromise = client
              .query('select true')
              .catch(
                logger.warn.bind(
                  logger,
                  'pg-notifications-notifier: error while running keep-alive query'
                )
              )
          }, keepAliveInterval)
        }
        return client
      })
      .catch(
        /* istanbul ignore next */ (err) => {
          logger.error(
            'pg-notifications-notifier: error while configuring listener',
            err
          )
          throw err
        }
      )

    return async () => {
      if (interval) {
        clearInterval(interval)
        await intervalPromise
      }
      return clientPromise.then((c) => {
        c.removeListener('notification', invokeListeners)
        return c.end()
      })
    }
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
    return new Client(createPostgresClientConfig(pgConfig))
  }
}
