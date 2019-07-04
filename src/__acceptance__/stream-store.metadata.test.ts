import { StreamStore, ExpectedVersion, WrongExpectedVersionError } from '..'
import { v4 } from 'uuid'
import { generateMessages } from '../__helpers__/message-helper'

jest.setTimeout(10000)

export function metadataTestsFor(
  getStore: () => Promise<StreamStore>,
  teardown?: () => Promise<unknown>
) {
  let store: StreamStore
  beforeAll(async () => {
    store = await getStore()
  })

  afterAll(() => store.dispose().then(teardown))

  test('can get and set metadata for a stream', async () => {
    const streamId = v4()
    await store.appendToStream(
      streamId,
      ExpectedVersion.Empty,
      generateMessages(5)
    )

    await expect(store.readStreamMetadata(streamId)).resolves.toEqual({
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
    const getResult1 = await store.readStreamMetadata(streamId)
    expect(getResult1.metadataStreamVersion).toBe(0)
    expect(getResult1.streamId).toBe(streamId)
    expect(getResult1.metadata).toEqual({ me: 'ta', da: 'ta' })

    await expect(
      store.setStreamMetadata(streamId, ExpectedVersion.Empty, { metadata: {} })
    ).rejects.toBeInstanceOf(WrongExpectedVersionError)

    await store.setStreamMetadata(streamId, setResult1.currentVersion, {
      metadata: { up: 'dated' }
    })

    const getResult2 = await store.readStreamMetadata(streamId)
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

    const getResult1 = await store.readStreamMetadata(streamId)
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

    const getResult2 = await store.readStreamMetadata(streamId)
    expect(getResult2).toEqual({
      streamId,
      metadataStreamVersion: 1,
      maxAge: null,
      maxCount: null,
      metadata: {}
    })
  })
}
