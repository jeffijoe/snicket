import { StreamStore, ExpectedVersion, ReadFrom, ReadDirection } from '..'
import { v4 } from 'uuid'
import { generateMessages } from '../__helpers__/message-helper'

export function readAllTestsFor(
  getStore: () => Promise<StreamStore>,
  teardown?: () => Promise<unknown>
) {
  const streamId1 = v4()
  const streamId2 = v4()
  let store: StreamStore
  beforeAll(async () => {
    store = await getStore()
  })

  afterAll(() => store.dispose().then(teardown))

  test('empty', async () => {
    expect(
      await store.readAll(ReadFrom.Start, 10, ReadDirection.Forward)
    ).toEqual({
      isEnd: true,
      messages: [],
      nextPosition: '0'
    })

    expect(
      await store.readAll(ReadFrom.Start, 10, ReadDirection.Backward)
    ).toEqual({
      isEnd: true,
      messages: [],
      nextPosition: '-1'
    })

    // Empty stream or no stream, should be the same result.
    await store.appendToStream(v4(), ExpectedVersion.Empty, [])

    expect(
      await store.readAll(ReadFrom.Start, 10, ReadDirection.Forward)
    ).toEqual({
      isEnd: true,
      messages: [],
      nextPosition: '0'
    })

    expect(
      // Note, using ReadFrom.End here is intentional, the end
      // result should be the same but different code paths might be triggered.
      await store.readAll(ReadFrom.End, 10, ReadDirection.Backward)
    ).toEqual({
      isEnd: true,
      messages: [],
      nextPosition: '-1'
    })
  })

  describe('reading all messages', () => {
    beforeAll(async () => {
      await store.appendToStream(
        streamId1,
        ExpectedVersion.Any,
        generateMessages(10)
      )
      await store.appendToStream(
        streamId2,
        ExpectedVersion.Any,
        generateMessages(10)
      )
    })

    test('reads all messages', async () => {
      const result1 = await store.readAll('0', 10)
      expect(result1.isEnd).toBe(false)
      expect(result1.nextPosition).toBe('10')
      expect(result1.messages.length).toBe(10)

      const result2 = await store.readAll(result1.nextPosition, 10)
      expect(result2.isEnd).toBe(true)
      expect(result2.nextPosition).toBe('20')
      expect(result2.messages.length).toBe(10)

      const allResult = await store.readAll('0', 1000)
      expect(allResult.isEnd).toBe(true)
      expect(allResult.messages).toEqual([
        ...result1.messages,
        ...result2.messages
      ])

      const theEnd = await store.readAll(allResult.nextPosition, 10)
      expect(theEnd.isEnd).toBe(true)
      expect(theEnd.messages).toEqual([])

      const afterTheEnd = await store.readAll(theEnd.nextPosition, 10)
      expect(afterTheEnd.nextPosition).toBe(theEnd.nextPosition)
      expect(afterTheEnd.isEnd).toBe(theEnd.isEnd)
      expect(afterTheEnd.messages).toHaveLength(0)
    })

    test('can read backwards', async () => {
      const result1 = await store.readAll(
        ReadFrom.End,
        10,
        ReadDirection.Backward
      )
      expect(result1.isEnd).toBe(false)
      expect(result1.nextPosition).toBe('9')
      expect(result1.messages.length).toBe(10)

      const result2 = await store.readAll(
        result1.nextPosition,
        10,
        ReadDirection.Backward
      )
      expect(result2.isEnd).toBe(true)
      expect(result2.nextPosition).toBe('-1')
      expect(result2.messages.length).toBe(10)

      const allResult = await store.readAll(
        ReadFrom.End,
        1000,
        ReadDirection.Backward
      )
      expect(allResult.isEnd).toBe(true)
      expect(allResult.messages).toEqual([
        ...result1.messages,
        ...result2.messages
      ])
    })
  })
}
