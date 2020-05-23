import { StreamStore, ExpectedVersion } from '..'
import { v4 } from 'uuid'
import { generateMessages } from '../__helpers__/message-helper'

export function scavengingTruncateBeforeTestsFor(
  getStore: () => Promise<StreamStore>,
  teardown?: () => Promise<unknown>
) {
  let store: StreamStore
  beforeAll(async () => {
    store = await getStore()
  })

  afterAll(() => store.dispose().then(teardown))

  test('scavenges stream with a truncate before on append', async () => {
    const streamId = v4()
    let write = await store.appendToStream(
      streamId,
      ExpectedVersion.Empty,
      generateMessages(5)
    )
    let read = await store.readStream(streamId, 0, 100)
    expect(read.messages).toHaveLength(5)

    write = await store.appendToStream(
      streamId,
      write.streamVersion,
      generateMessages(5)
    )
    read = await store.readStream(streamId, 0, 100)
    const truncatedAt = read.messages[5]
    expect(read.messages).toHaveLength(10)

    await store.setStreamMetadata(streamId, ExpectedVersion.Empty, {
      truncateBefore: 5,
    })
    read = await store.readStream(streamId, 0, 100)
    expect(read.messages).toHaveLength(5)
    expect(read.messages[0].messageId).toBe(truncatedAt.messageId)

    write = await store.appendToStream(
      streamId,
      write.streamVersion,
      generateMessages(5)
    )
    read = await store.readStream(streamId, 0, 100)
    expect(read.messages).toHaveLength(10)
  })
}
