import { ExpectedVersion } from '../../types/stream-store'
import { createPostgresStreamStore, PgStreamStore } from '../pg-stream-store'
import { v4 } from 'uuid'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { generateMessages } from './__helpers__/message-helper'
import { ConcurrencyError } from '../../errors/errors'

jest.setTimeout(10000)

let store: PgStreamStore

beforeAll(async () => {
  store = createPostgresStreamStore({ ...streamStoreCfg, logger: undefined })
})

afterAll(() => store.dispose())

test('can get and set metadata for a stream', async () => {
  const streamId = v4()
  await store.appendToStream(
    streamId,
    ExpectedVersion.Empty,
    generateMessages(5)
  )

  await expect(store.getStreamMetadata(streamId)).resolves.toEqual({
    streamId,
    metadata: null,
    metadataStreamVersion: -1
  })

  const setResult1 = await store.setStreamMetadata(
    streamId,
    ExpectedVersion.Empty,
    {
      metadata: { meta: 'data' }
    }
  )
  expect(setResult1.currentVersion).toBe(0)
  const getResult1 = await store.getStreamMetadata(streamId)
  expect(getResult1.metadataStreamVersion).toBe(0)
  expect(getResult1.streamId).toBe(streamId)
  expect(getResult1.metadata).toEqual({ meta: 'data' })

  await expect(
    store.setStreamMetadata(streamId, ExpectedVersion.Empty, { metadata: {} })
  ).rejects.toBeInstanceOf(ConcurrencyError)

  await store.setStreamMetadata(streamId, setResult1.currentVersion, {
    metadata: { up: 'dated' }
  })

  const getResult2 = await store.getStreamMetadata(streamId)
  expect(getResult2.metadataStreamVersion).toBe(1)
  expect(getResult2.streamId).toBe(streamId)
  expect(getResult2.metadata).toEqual({ up: 'dated' })
})
