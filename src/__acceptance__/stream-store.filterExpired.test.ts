import { StreamStore, ExpectedVersion } from '..'
import { v4 } from 'uuid'
import { generateMessages } from '../__helpers__/message-helper'
import { waitUntil } from '../__helpers__/wait-helper'

jest.setTimeout(20000)

export function filterExpiredTest(
  getStores: () => Promise<{
    store: StreamStore
    nonFilteringStore: StreamStore
  }>,
  teardown?: () => Promise<unknown>
) {
  let store: StreamStore
  let nonFilteringStore: StreamStore
  beforeAll(async () => {
    const got = await getStores()
    store = got.store
    nonFilteringStore = got.nonFilteringStore
  })

  afterAll(() =>
    Promise.all([
      store.dispose().catch(Boolean),
      nonFilteringStore.dispose().catch(Boolean)
    ]).then(teardown)
  )

  test('filters expired', async () => {
    const streamId = v4()
    await store.appendToStream(
      streamId,
      ExpectedVersion.Empty,
      generateMessages(5)
    )

    await store.setStreamMetadata(streamId, ExpectedVersion.Empty, {
      maxAge: 5
    })

    const before = await store.readStream(streamId, 0, 200)
    expect(before.messages).toHaveLength(5)

    await waitUntil(async () => {
      const result = await store.readStream(streamId, 0, 200)
      return result.messages.length === 0
    })
    // Verify that with filtering disabled that messages get purged.
    await waitUntil(async () => {
      const result = await nonFilteringStore.readStream(streamId, 0, 200)
      return result.messages.length === 0
    })
    // Verify they don't appear in the all-stream
    await waitUntil(async () => {
      const result = await store.readAll(0, 999999)
      return !result.messages.some(m =>
        before.messages.some(b => b.messageId === m.messageId)
      )
    })
  })
}
