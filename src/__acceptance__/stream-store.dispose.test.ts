import { StreamStore, ExpectedVersion, DisposedError } from '..'
import { v4 } from 'uuid'
import { delay } from '../utils/promise-util'
import { createResetEvent } from '../utils/reset-event'

// tslint:disable:no-floating-promises

export function disposeTestsFor(
  getStore: () => Promise<StreamStore>,
  teardown?: () => Promise<unknown>
) {
  /* istanbul ignore next */
  afterAll(() => teardown && teardown())

  test('waits for writes', async () => {
    const store = await getStore()
    try {
      const streamId = v4()
      // Make sure there's a subscription to dispose as well.
      await store.subscribeToStream(streamId, noop as any)
      const p = store.appendToStream(streamId, ExpectedVersion.Empty, [
        {
          messageId: v4(),
          data: {},
          type: 'test',
        },
      ])

      await store.dispose()
      const appendResult = await p
      expect(appendResult.streamVersion).toBe(0)

      await expect(
        store.appendToStream(streamId, ExpectedVersion.Empty, [
          {
            messageId: v4(),
            data: {},
            type: 'test',
          },
        ])
      ).rejects.toBeInstanceOf(DisposedError)

      await expect(store.dispose()).rejects.toBeInstanceOf(DisposedError)
    } finally {
      await store.dispose().catch(Boolean)
    }
  })

  test('waits for subscriptions', async () => {
    const store = await getStore()
    try {
      const streamId = v4()

      // Used to track whether, when the test ends, that the subscription handlers
      // were allowed to run to completion and that the store.dispose accounted for it.
      let streamSubCompleted = 0
      let streamSubDisposerCompleted = 0
      let allSubCompleted = 0
      let allSubDisposerCompleted = 0

      // Signals to the test code that the message handler has started.
      const onStreamMessage = createResetEvent()
      const onAllMessage = createResetEvent()
      const streamSub = await store.subscribeToStream(
        streamId,
        () => {
          onStreamMessage.set()
          return delay(500).then(() => {
            streamSubCompleted++
          })
        },
        {
          dispose: () =>
            delay(500).then(() => {
              streamSubDisposerCompleted++
            }),
        }
      )
      const allSub = await store.subscribeToAll(
        async (msg) => {
          // Only "listen" for the stream message.
          /* istanbul ignore else */
          if (msg.streamId === streamId) {
            onAllMessage.set()
            return delay(500).then(() => {
              allSubCompleted++
            })
          }
        },
        {
          dispose: () =>
            delay(500).then(() => {
              allSubDisposerCompleted++
            }),
        }
      )
      const onStreamMessagePromise = onStreamMessage.wait()
      const onAllMessagePromise = onAllMessage.wait()
      await store.appendToStream(streamId, ExpectedVersion.Empty, [
        {
          messageId: v4(),
          data: {},
          type: 'test',
        },
      ])

      await onStreamMessagePromise
      streamSub.dispose()
      streamSub.dispose() // idempotent

      await onAllMessagePromise
      allSub.dispose()
      allSub.dispose() // idempotent

      await store.dispose()
      expect(streamSubCompleted).toBe(1)
      expect(allSubCompleted).toBe(1)
      expect(streamSubDisposerCompleted).toBe(1)
      expect(allSubDisposerCompleted).toBe(1)
    } finally {
      await store.dispose().catch(Boolean)
    }
  })
}

/**
 * No-op.
 */
function noop() {
  /**/
}
