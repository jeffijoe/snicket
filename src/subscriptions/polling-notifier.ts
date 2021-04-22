import { StreamStoreNotifier } from '../types/subscriptions'
import { StreamStore } from '../types/stream-store'
import { Logger } from '../types/logger'
import BigInteger from 'big-integer'
import { DisposedError } from '../errors/errors'
import { delay } from '../utils/promise-util'
import { PollingNotifierConfig } from '../postgres'

/**
 * A Polling Notifier will poll the head for changes and signal whenever there's
 * changes to pull.
 *
 * @param readHeadPosition a function to read the head position
 * @param logger used for logging trace-level stuff as well as errors
 * @param notifierConfig the configuration for the notifier
 */
export function createPollingNotifier(
  readHeadPosition: StreamStore['readHeadPosition'],
  logger: Logger,
  notifierConfig: PollingNotifierConfig
): StreamStoreNotifier {
  const interval = notifierConfig.pollingInterval || 500
  let _listeners: Array<Function> = []
  let _disposed = false

  // tslint:disable-next-line
  let p = poll()

  return {
    /**
     * Adds the specified listener. Returns a disposer.
     * @param cb
     */
    listen(cb) {
      DisposedError.assert(!_disposed, 'The notifier has been disposed.')
      _listeners.push(cb)
      return () => {
        _listeners.splice(_listeners.indexOf(cb), 1)
      }
    },
    /**
     * Disposes all listeners and stops polling.
     */
    async dispose() {
      DisposedError.assert(
        !_disposed,
        'The notifier has already been disposed.'
      )
      _disposed = true
      await p
      _listeners = []
    },
  }

  /**
   * Async poll loop.
   */
  async function poll() {
    let headPosition = BigInteger('-1')
    let previousHeadPosition = BigInteger(headPosition)
    logger.trace('polling-notifier: started polling.')
    while (!_disposed) {
      try {
        headPosition = await readHeadPosition().then(BigInteger)
      } catch (err) {
        /* istanbul ignore next */
        logger.error(
          'polling-notifier: Error occurred while polling stream store for messages: ' +
            err.messages,
          err
        )
      }

      /* istanbul ignore next */
      if (_disposed) {
        return
      }

      if (headPosition.greater(previousHeadPosition)) {
        logger.trace(
          `polling-notifier: head position changed: ${headPosition}, previous ${previousHeadPosition}.`
        )
        invokeListeners()
        previousHeadPosition = headPosition
      } else {
        await delay(interval)
      }
    }
    logger.trace('polling-notifier: polling loop exited.')
  }

  /**
   * Invokes the listeners.
   */
  function invokeListeners() {
    for (const i in _listeners) {
      _listeners[i]()
    }
  }
}
