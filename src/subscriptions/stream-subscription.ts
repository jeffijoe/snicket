import { StreamStore, ReadStreamResult } from '../types/stream-store'
import {
  StreamSubscriptionOptions,
  StreamStoreNotifier,
  StreamSubscription,
  SubscribeAt,
  MessageProcessor
} from '../types/subscriptions'
import { createResetEvent } from '../utils/reset-event'
import { DisposedError } from '../errors/errors'
import { createDuplexLatch } from '../utils/latch'
import * as invariant from '../utils/invariant'
import { Logger } from '../types/logger'
import { retry } from 'fejl'

/* istanbul ignore next */
// tslint:disable-next-line:no-empty
const noop = () => {}

/**
 * Creates a stream subscription.
 * This is a low-level API and is consumed by the stream store implementations themselves.
 *
 * @param streamId
 * @param store
 * @param notifier
 * @param logger
 * @param processMessage
 * @param cfg
 */
export function createStreamSubscription(
  streamId: string,
  store: StreamStore,
  notifier: StreamStoreNotifier,
  logger: Logger,
  processMessage: MessageProcessor,
  cfg: StreamSubscriptionOptions & { onEstablished: Function }
): StreamSubscription {
  invariant.requiredString('streamId', streamId)
  invariant.requiredFunc('processMessage', processMessage)
  const next = createResetEvent()
  const loopLatch = createDuplexLatch()
  const disposeListener = notifier.listen(next.set)
  let _disposed = false
  let _nextVersion = SubscribeAt.End
  const config: StreamSubscriptionOptions = {
    dispose: /* istanbul ignore next */ () => Promise.resolve(),
    onCaughtUpChanged: noop,
    afterVersion: SubscribeAt.End,
    onSubscriptionDropped: noop,
    maxCountPerRead: 20,
    ...cfg
  }

  // Called after having read the start position.
  let onEstablished = cfg.onEstablished

  // tslint:disable-next-line
  pullAndPush()

  return {
    streamId,
    dispose
  }

  async function pullAndPush() {
    // If we subscribe at the end, initialize with that version.
    let startVersion = await Promise.resolve(
      config.afterVersion === SubscribeAt.Beginning
        ? 0
        : config.afterVersion === SubscribeAt.End
        ? getStartVersionForStreamEnd()
        : config.afterVersion! + 1
    )
    onEstablished()

    // If `getEndVersion` threw an error, the subscription has
    // been dropped, so return now.
    if (_disposed) {
      return
    }

    _nextVersion = startVersion
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
        const readResult = await pull(_nextVersion)
        const isEnd = readResult.isEnd
        const pushErr = await push(readResult)
        if (pushErr) {
          return
        }
        paused = readResult.isEnd && readResult.messages.length === 0
        if (!paused) {
          _nextVersion = readResult.nextVersion
        }

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
        }
      }

      // Wait for the notifier.
      await next.wait()
      next.reset()
    }
  }

  /**
   * Gets the next version after the current end.
   */
  async function getStartVersionForStreamEnd() {
    try {
      const info = await store.readStream(streamId, 0, 1)
      return info.streamVersion + 1
    } catch (error) {
      logger.error(
        'Unable to get stream information. Dropping subscription and disposing.',
        error
      )
      await dropAndDispose()
      return -1
    }
  }

  /**
   * Pulls
   * @param nextVersion
   */
  async function pull(nextVersion: number) {
    const result = await store.readStream(
      streamId,
      nextVersion,
      config.maxCountPerRead!
    )
    return result
  }

  /**
   * Pushes the messages to the subsriber.
   * @param readResult
   * @returns `true` if an error occurred while processing messages, `false` otherwise.
   */
  async function push(readResult: ReadStreamResult): Promise<boolean> {
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
