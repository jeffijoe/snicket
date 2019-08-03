import { v4 } from 'uuid'
import { StreamStore, ExpectedVersion, ReadFrom, ReadDirection } from '..'
import { generateMessages } from '../__helpers__/message-helper'

jest.setTimeout(6000000)

export function readStreamTestsFor(
  getStore: () => Promise<StreamStore>,
  teardown?: () => Promise<unknown>
) {
  let store: StreamStore
  beforeAll(async () => {
    store = await getStore()
  })

  afterAll(() => store.dispose().then(teardown))

  describe('reading a stream', () => {
    test('basic', async () => {
      const streamId = v4()
      const resultNoStream = await store.readStream(streamId, 0, 10)
      expect(resultNoStream).toMatchObject({
        streamId,
        streamVersion: -1,
        streamPosition: '-1',
        nextVersion: 0,
        isEnd: true
      })

      await store.appendToStream(streamId, ExpectedVersion.Empty, [])
      const resultEmpty = await store.readStream(streamId, 0, 10)
      expect(resultEmpty).toMatchObject({
        streamId,
        streamVersion: -1,
        streamPosition: '-1',
        nextVersion: 0,
        isEnd: true
      })

      await store.appendToStream(
        streamId,
        ExpectedVersion.Empty,
        generateMessages(5)
      )

      const result1 = await store.readStream(streamId, 0, 10)
      expect(result1).toMatchObject({
        streamVersion: 4,
        streamPosition: expect.any(String),
        nextVersion: 5,
        streamId: streamId,
        isEnd: true,
        messages: expect.arrayContaining([
          expect.objectContaining({
            streamId: streamId,
            data: { hello: 'world', index: 0 },
            meta: { me: 'ta' },
            createdAt: expect.any(Date),
            type: 'greeting',
            position: expect.any(String)
          })
        ])
      })

      await store.appendToStream(
        streamId,
        result1.streamVersion,
        generateMessages(5)
      )

      const result2 = await store.readStream(streamId, 0, 10)
      expect(result2).toMatchObject({
        streamVersion: 9,
        streamPosition: expect.any(String),
        nextVersion: 10,
        streamId: streamId,
        isEnd: true,
        messages: expect.arrayContaining([
          expect.objectContaining({
            streamId: streamId,
            data: { hello: 'world', index: 0 },
            meta: { me: 'ta' },
            createdAt: expect.any(Date),
            type: 'greeting',
            position: expect.any(String)
          })
        ])
      })
    })

    test('paging', async () => {
      const streamId = v4()
      await store.appendToStream(
        streamId,
        ExpectedVersion.Empty,
        generateMessages(20)
      )

      const page1 = await store.readStream(streamId, 0, 5)
      expect(page1).toMatchObject({
        streamId: streamId,
        nextVersion: 5,
        streamVersion: 19,
        isEnd: false
      })
      expect(page1.messages).toHaveLength(5)
      expect(page1.messages[page1.messages.length - 1].streamVersion).toBe(4)

      const page2 = await store.readStream(streamId, page1.nextVersion, 5)
      expect(page2).toMatchObject({
        nextVersion: 10
      })
      expect(page2.messages[0].messageId).not.toBe(
        page1.messages[page1.messages.length - 1].messageId
      )
      // Expect the delta between the 2 versions to be 1
      expect(
        page2.messages[0].streamVersion -
          page1.messages[page1.messages.length - 1].streamVersion
      ).toBe(1)

      expect(
        (await store.readStream(streamId, page2.nextVersion, 9)).isEnd
      ).toBe(false)

      const page3 = await store.readStream(streamId, page2.nextVersion, 10)
      expect(page3.isEnd).toBe(true)
    })

    test('reading non-existent stream', async () => {
      const result = await store.readStream(v4(), 0, 10)
      expect(result.isEnd).toBe(true)
    })

    test('reading past the latest version', async () => {
      const streamId = v4()
      await store.appendToStream(
        streamId,
        ExpectedVersion.Empty,
        generateMessages(10)
      )
      const result = await store.readStream(streamId, 10, 10)
      expect(result.isEnd).toBe(true)
      expect(result.nextVersion).toBe(result.streamVersion + 1)
      expect(result.messages).toHaveLength(0)
    })
  })

  describe('backwards', () => {
    test('can read streams backwards', async () => {
      const streamId = v4()
      await store.appendToStream(
        streamId,
        ExpectedVersion.Empty,
        generateMessages(10)
      )
      const result1 = await store.readStream(
        streamId,
        ReadFrom.End,
        5,
        ReadDirection.Backward
      )

      expect(result1.isEnd).toBe(false)
      expect(result1.nextVersion).toBe(4)
      expect(result1.messages.length).toBe(5)
      expect(result1.messages[0].streamVersion).toBe(
        result1.messages[1].streamVersion + 1
      )

      const result2 = await store.readStream(
        streamId,
        result1.nextVersion,
        5,
        ReadDirection.Backward
      )

      expect(result2.isEnd).toBe(true)
      expect(result2.nextVersion).toBe(-1)
      expect(result2.messages.length).toBe(5)
      expect(result2.messages[0].streamVersion).toBe(
        result2.messages[1].streamVersion + 1
      )

      const allResult = await store.readStream(
        streamId,
        ReadFrom.End,
        1000,
        ReadDirection.Backward
      )
      expect(allResult.isEnd).toBe(true)
      expect(allResult.nextVersion).toBe(-1)
      expect(allResult.messages).toEqual([
        ...result1.messages,
        ...result2.messages
      ])
    })
  })

  test('empty', async () => {
    const streamId = v4()

    expect(
      await store.readStream(
        streamId,
        ReadFrom.Start,
        10,
        ReadDirection.Forward
      )
    ).toEqual({
      isEnd: true,
      messages: [],
      nextVersion: 0,
      streamId,
      streamPosition: '-1',
      streamVersion: -1
    })

    expect(
      await store.readStream(
        streamId,
        ReadFrom.Start,
        10,
        ReadDirection.Backward
      )
    ).toEqual({
      isEnd: true,
      messages: [],
      nextVersion: -1,
      streamId,
      streamPosition: '-1',
      streamVersion: -1
    })

    // No Stream vs Empty should yield the same results
    await store.appendToStream(streamId, ExpectedVersion.Empty, [])

    expect(
      await store.readStream(
        streamId,
        ReadFrom.Start,
        10,
        ReadDirection.Forward
      )
    ).toEqual({
      isEnd: true,
      messages: [],
      nextVersion: 0,
      streamId,
      streamPosition: '-1',
      streamVersion: -1
    })
    expect(
      await store.readStream(streamId, ReadFrom.End, 10, ReadDirection.Forward)
    ).toEqual({
      isEnd: true,
      messages: [],
      nextVersion: 0,
      streamId,
      streamPosition: '-1',
      streamVersion: -1
    })

    expect(
      await store.readStream(
        streamId,
        ReadFrom.Start,
        10,
        ReadDirection.Backward
      )
    ).toEqual({
      isEnd: true,
      messages: [],
      nextVersion: -1,
      streamId,
      streamPosition: '-1',
      streamVersion: -1
    })
    expect(
      await store.readStream(streamId, ReadFrom.End, 10, ReadDirection.Backward)
    ).toEqual({
      isEnd: true,
      messages: [],
      nextVersion: -1,
      streamId,
      streamPosition: '-1',
      streamVersion: -1
    })
  })
}
