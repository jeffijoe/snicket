import { delay } from '../utils/promise-util'
import { StreamStore } from '../types/stream-store'
import { StreamMessage } from '../types/messages'
import { SubscribeAt } from '../types/subscriptions'

/**
 * Waits until the loop returns true.
 *
 * @param loop
 * @param ms
 */
export async function waitUntil<T>(loop: () => T | Promise<T>, ms = 50) {
  do {
    const result = await Promise.resolve(loop())
    if (result) {
      return result
    }
    await delay(ms)
  } while (true)
}

/**
 * Waits for a stream subscription to emit a message matching the specified function, then closes the subscription.
 *
 * @param store
 * @param streamId
 * @param match
 */
export function waitForStreamSubscription(
  store: StreamStore,
  streamId: string,
  match: (msg: StreamMessage) => boolean
) {
  return new Promise(async (resolve, reject) => {
    const sub = await store.subscribeToStream(
      streamId,
      async (msg) => {
        if (match(msg)) {
          sub.dispose().then(() => resolve(), reject)
        }
      },
      {
        afterVersion: SubscribeAt.Beginning,
        maxCountPerRead: 500,
      }
    )
  })
}

/**
 * Waits for an all-stream subscription to emit a message matching the specified function, then closes the subscription.
 *
 * @param store
 * @param match
 */
export function waitForAllSubscription(
  store: StreamStore,
  match: (msg: StreamMessage) => boolean
) {
  return new Promise(async (resolve, reject) => {
    const sub = await store.subscribeToAll(
      async (msg) => {
        if (match(msg)) {
          sub.dispose().then(() => resolve(), reject)
        }
      },
      {
        afterPosition: SubscribeAt.Beginning,
        maxCountPerRead: 500,
      }
    )
  })
}
