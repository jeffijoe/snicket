import { ExpectedVersion, ReadDirection } from '../../types/stream-store'
import { createPostgresStreamStore, PgStreamStore } from '../pg-stream-store'
import { v4 } from 'uuid'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { generateMessages } from './__helpers__/message-helper'
import { Position } from '../../types/messages'

jest.setTimeout(6000000)

let store: PgStreamStore

beforeAll(async () => {
  store = createPostgresStreamStore({ ...streamStoreCfg, logger: undefined })
})

afterAll(() => store.dispose())

describe('reading a stream', () => {
  test('basic', async () => {
    const streamId = v4()
    await store.appendToStream(
      streamId,
      ExpectedVersion.Empty,
      generateMessages(5)
    )

    const result = await store.readStream(streamId, 0, 10)
    expect(result).toMatchObject({
      streamVersion: 4,
      streamPosition: expect.any(String),
      nextVersion: 5,
      streamId: streamId,
      isEnd: true,
      messages: expect.arrayContaining([
        expect.objectContaining({
          streamId: streamId,
          data: { hello: 'world' },
          meta: { me: 'ta' },
          dateCreated: expect.any(Date),
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

    expect((await store.readStream(streamId, page2.nextVersion, 9)).isEnd).toBe(
      false
    )

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
      Position.End,
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
    expect(result2.nextVersion).toBe(0)
    expect(result2.messages.length).toBe(5)
    expect(result2.messages[0].streamVersion).toBe(
      result2.messages[1].streamVersion + 1
    )

    const allResult = await store.readStream(
      streamId,
      Position.End,
      1000,
      ReadDirection.Backward
    )
    expect(allResult.isEnd).toBe(true)
    expect(allResult.messages).toEqual([
      ...result1.messages,
      ...result2.messages
    ])

    const theEnd = await store.readStream(
      streamId,
      allResult.nextVersion,
      10,
      ReadDirection.Backward
    )

    expect(theEnd.isEnd).toBe(true)

    expect(theEnd.messages).toEqual([
      result2.messages[result2.messages.length - 1]
    ])
  })
})
