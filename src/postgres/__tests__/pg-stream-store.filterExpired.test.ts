import { createPostgresStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { v4 } from 'uuid'
import { ExpectedVersion } from '../../types/stream-store'
import { generateMessages } from './__helpers__/message-helper'
import { waitUntil } from '../../__helpers__/wait-helper'

jest.setTimeout(20000)

const store = createPostgresStreamStore({
  ...streamStoreCfg,
  reading: {
    filterExpiredMessages: true,
    metadataCacheTtl: 5
  }
})

const nonFilteringStore = createPostgresStreamStore({
  ...streamStoreCfg
})

afterAll(() => Promise.all([store.dispose(), nonFilteringStore.dispose()]))

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
})
