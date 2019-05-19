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
    metadataStreamVersion: -1,
    maxAge: null,
    maxCount: null
  })

  const setResult1 = await store.setStreamMetadata(
    streamId,
    ExpectedVersion.Empty,
    {
      metadata: { me: 'ta', da: 'ta' }
    }
  )
  expect(setResult1.currentVersion).toBe(0)
  const getResult1 = await store.getStreamMetadata(streamId)
  expect(getResult1.metadataStreamVersion).toBe(0)
  expect(getResult1.streamId).toBe(streamId)
  expect(getResult1.metadata).toEqual({ me: 'ta', da: 'ta' })

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

test('can get and set maxAge and maxCount for a stream', async () => {
  const streamId = v4()

  const setResult1 = await store.setStreamMetadata(
    streamId,
    ExpectedVersion.Empty,
    {
      maxAge: 60,
      maxCount: 50,
      metadata: {}
    }
  )

  expect(setResult1.currentVersion).toBe(0)

  const getResult1 = await store.getStreamMetadata(streamId)
  expect(getResult1).toEqual({
    streamId,
    metadataStreamVersion: 0,
    maxAge: 60,
    maxCount: 50,
    metadata: {}
  })

  const setResult2 = await store.setStreamMetadata(
    streamId,
    getResult1.metadataStreamVersion,
    {
      maxAge: 0,
      maxCount: null
    }
  )

  expect(setResult2.currentVersion).toBe(1)

  const getResult2 = await store.getStreamMetadata(streamId)
  expect(getResult2).toEqual({
    streamId,
    metadataStreamVersion: 1,
    maxAge: null,
    maxCount: null,
    metadata: {}
  })

  await store.setStreamMetadata(streamId, setResult2.currentVersion, {
    maxAge: 100,
    maxCount: 200,
    metadata: {}
  })

  await store.appendToStream(
    streamId,
    ExpectedVersion.Empty,
    generateMessages(5)
  )

  const actualStream = await store.readStream(streamId, 0, 100)
  expect(actualStream.maxAge).toBe(100)
  expect(actualStream.maxCount).toBe(200)
})
