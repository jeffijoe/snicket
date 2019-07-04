import { StreamStore, ExpectedVersion, Position, ReadDirection } from '..'
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

  afterAll(() => store.dispose().then(teardown))

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
  })

  test('can read backwards', async () => {
    const result1 = await store.readAll(
      Position.End,
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
    expect(result2.nextPosition).toBe('0')
    expect(result2.messages.length).toBe(10)

    const allResult = await store.readAll(
      Position.End,
      1000,
      ReadDirection.Backward
    )
    expect(allResult.isEnd).toBe(true)
    expect(allResult.messages).toEqual([
      ...result1.messages,
      ...result2.messages
    ])

    const theEnd = await store.readAll(
      allResult.nextPosition,
      10,
      ReadDirection.Backward
    )

    expect(theEnd.isEnd).toBe(true)

    expect(theEnd.messages).toEqual([
      result2.messages[result2.messages.length - 1]
    ])
  })
}
