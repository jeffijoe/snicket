import { StreamStore, ExpectedVersion } from '..'
import { v4 } from 'uuid'
import { generateMessages } from '../__helpers__/message-helper'

export function scavengingMaxCountTestsFor(
  getStore: () => Promise<StreamStore>,
  teardown?: () => Promise<unknown>
) {
  let store: StreamStore
  beforeAll(async () => {
    store = await getStore()
  })

  afterAll(() => store.dispose().then(teardown))

  test('scavenges stream with a max count on append', async () => {
    const streamId = v4()
    await store.setStreamMetadata(streamId, ExpectedVersion.Empty, {
      maxCount: 5
    })

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
    expect(read.messages).toHaveLength(5)

    write = await store.appendToStream(
      streamId,
      write.streamVersion,
      generateMessages(5)
    )
    read = await store.readStream(streamId, 0, 100)
    expect(read.messages).toHaveLength(5)
  })

  test('scavenges stream when setting metadata', async () => {
    const streamId = v4()
    let write = await store.appendToStream(
      streamId,
      ExpectedVersion.Empty,
      generateMessages(10)
    )
    let read = await store.readStream(streamId, 0, 100)
    expect(read.messages).toHaveLength(10)

    await store.setStreamMetadata(streamId, ExpectedVersion.Empty, {
      maxCount: 5
    })

    read = await store.readStream(streamId, 0, 100)
    expect(read.messages).toHaveLength(5)

    write = await store.appendToStream(
      streamId,
      write.streamVersion,
      generateMessages(5)
    )
    read = await store.readStream(streamId, 0, 100)
    expect(read.messages).toHaveLength(5)
  })

  test('does not scavenge after having removed max count', async () => {
    const streamId = v4()
    let write = await store.appendToStream(
      streamId,
      ExpectedVersion.Empty,
      generateMessages(10)
    )
    let read = await store.readStream(streamId, 0, 100)
    expect(read.messages).toHaveLength(10)

    const metaWrite = await store.setStreamMetadata(
      streamId,
      ExpectedVersion.Empty,
      {
        maxCount: 5
      }
    )

    read = await store.readStream(streamId, 0, 100)
    expect(read.messages).toHaveLength(5)

    await store.setStreamMetadata(streamId, metaWrite.currentVersion, {
      maxCount: null
    })

    write = await store.appendToStream(
      streamId,
      write.streamVersion,
      generateMessages(5)
    )
    read = await store.readStream(streamId, 0, 100)
    expect(read.messages).toHaveLength(10)
  })
}
