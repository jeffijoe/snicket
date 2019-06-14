import { StreamStore, ReadAllResult } from '../types/stream-store'
import {
  StreamStoreNotifier,
  SubscribeAt,
  MessageProcessor,
  AllSubscriptionOptions,
  AllSubscription
} from '../types/subscriptions'
import { createResetEvent } from '../utils/reset-event'
import { DisposedError } from '../errors/errors'
import { createDuplexLatch } from '../utils/latch'
import { Logger } from '../types/logger'
import { retry } from 'fejl'
import BigInteger from 'big-integer'

/* istanbul ignore next */
// tslint:disable-next-line:no-empty
const noop = () => {}

/**
 * Creates a subscription for all streams.
 * This is a low-level API and is consumed by the stream store implementations themselves.
 *
 * @param store
 * @param notifier
 * @param logger
 * @param processMessage
 * @param cfg
 */
export function createAllSubscription(
  store: StreamStore,
  notifier: StreamStoreNotifier,
  logger: Logger,
  processMessage: MessageProcessor,
  cfg: AllSubscriptionOptions & { onEstablished: Function }
): AllSubscription {
  const next = createResetEvent()
  const loopLatch = createDuplexLatch()
  const disposeListener = notifier.listen(next.set)
  let _disposed = false
  let _nextPosition = BigInteger(SubscribeAt.End)
  const config: AllSubscriptionOptions = {
    dispose: /* istanbul ignore next */ () => Promise.resolve(),
    onCaughtUpChanged: noop,
    afterPosition: SubscribeAt.End.toString(),
    onSubscriptionDropped: noop,
    maxCountPerRead: 20,
    ...cfg
  }

  // Called after having read the start position.
  let onEstablished = cfg.onEstablished

  // tslint:disable-next-line
  pullAndPush()

  return {
    dispose
  }

  async function pullAndPush() {
    logger.trace('all-subscription: started')
    // If we subscribe at the end, initialize with that version.
    let startPosition = await Promise.resolve(
      BigInteger(config.afterPosition! as string).equals(SubscribeAt.Beginning)
        ? BigInteger.zero
        : BigInteger(config.afterPosition as string).equals(SubscribeAt.End)
        ? getStartPositionForEnd()
        : BigInteger(config.afterPosition as string).plus(1)
    )

    onEstablished()

    // If `getStartPositionForEnd` threw an error, the subscription has
    // been dropped, so return now.
    if (_disposed) {
      return
    }

    _nextPosition = startPosition
    // Used to make sure we finish processing in-flight messages when disposing.
    loopLatch.enter()
    try {
      await retry((again, attempt) =>
        pullAndPushInternal().catch(err => {
          logger.error(
            `Error occurred in subscription while pulling messages; retrying (${attempt}).`,
            err
          )
          throw again(err)
        })
      )
    } catch (err) {
      /* istanbul ignore next */
      logger.error(
        'Error occurred in subscription while pulling messages, all retries exhausted. Will drop subscription and dispose.',
        err
      )
    } finally {
      loopLatch.exit()
    }

    if (!_disposed) {
      return dropAndDispose()
    }
  }

  /**
   * The pull+push loop.
   */
  async function pullAndPushInternal() {
    const onCaughtUpChanged = config.onCaughtUpChanged!
    while (!_disposed) {
      let paused = false
      let lastHasCaughtUp: boolean | null = null
      while (!paused && !_disposed) {
        const readResult = await pull(_nextPosition)
        logger.trace(
          `all-subscription: read ${readResult.messages.length} messages`
        )
        const isEnd = readResult.isEnd
        const pushErr = await push(readResult)
        if (pushErr) {
          return
        }
        paused = readResult.isEnd && readResult.messages.length === 0
        _nextPosition = BigInteger(readResult.nextPosition)

        if (
          // We haven't reported any catch-up status and we reached the end...
          ((lastHasCaughtUp === null && isEnd) ||
            // Or we haven't reported any catch-up status or the status has
            // changed since the last time we reported..
            (lastHasCaughtUp === null || lastHasCaughtUp !== isEnd)) &&
          // And we got stuff back
          readResult.messages.length > 0
        ) {
          // Notify the consumer.
          lastHasCaughtUp = isEnd
          onCaughtUpChanged(lastHasCaughtUp)
          logger.trace(
            `all-subscription: catch-up status changed. caught up: ${lastHasCaughtUp}`
          )
        }
      }

      // Wait for the notifier.
      logger.trace(`all-subscription: waiting for notification`)
      await next.wait()
      next.reset()
    }
  }

  /**
   * Gets the next version after the current end.
   */
  async function getStartPositionForEnd() {
    try {
      const head = await store.readHeadPosition()
      // Edge case where start position is 0 (beginning of time) and the stream is empty.
      if (head === '0') {
        return BigInteger.zero
      }
      return BigInteger(head).plus(1)
    } catch (error) {
      logger.error(
        'Unable to get stream information. Dropping subscription and disposing.',
        error
      )
      await dropAndDispose()
      return BigInteger(-1)
    }
  }

  /**
   * Pulls
   * @param nextPosition
   */
  async function pull(nextPosition: BigInteger.BigInteger) {
    logger.trace(
      `all-subscription: pulling messages (nextPosition: ${nextPosition})`
    )
    const result = await store.readAll(
      nextPosition.toString(),
      config.maxCountPerRead!
    )
    logger.trace(
      `all-subscription: pulled messages (result.nextPosition: ${result.nextPosition})`
    )
    return result
  }

  /**
   * Pushes the messages to the subsriber.
   * @param readResult
   * @returns `true` if an error occurred while processing messages, `false` otherwise.
   */
  async function push(readResult: ReadAllResult): Promise<boolean> {
    const messages = readResult.messages
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const err = await Promise.resolve()
        .then(() => processMessage(msg))
        .then(() => null)
        .catch((err: Error) => {
          logger.error(
            `Error processing message (id: ${msg.messageId}, type: ${msg.type}), dropping subscription.`,
            err
          )
          return err
        })

      if (err) {
        return true
      }
    }
    return false
  }

  /**
   * Drops the subscription and notifies the subscriber, then disposes the subscription.
   */
  function dropAndDispose() {
    config.onSubscriptionDropped!()
    return dispose()
  }

  /**
   * Disposes the subscription.
   * Does not call `config.onSubscriptionDropped`, as this is only done if we drop the subscription
   * rather than the consumer disposing.
   */
  async function dispose() {
    DisposedError.assert(!_disposed)
    _disposed = true
    disposeListener()
    // In case we are waiting in the loop, make it continue so it can exit.
    next.set()
    // Waits for the loop to fully exit.
    await loopLatch.wait()
    await config.dispose!()
  }
}
