import { StreamStore, SubscribeAt, ExpectedVersion, noopLogger } from '..'
import { v4 } from 'uuid'
import { generateMessages } from '../__helpers__/message-helper'
import { waitUntil } from '../__helpers__/wait-helper'
import { Logger } from '../types/logger'

jest.setTimeout(50000)

export function subscribeToAllTestsFor(
  getStoreInner: (logger?: Logger) => Promise<StreamStore>,
  teardown?: () => Promise<unknown>
) {
  const disposers: Function[] = []
  const getStore = async (logger?: Logger) => {
    const store = await getStoreInner(logger)
    disposers.push(() => store.dispose().catch(Boolean))
    return store
  }

  afterEach(() => Promise.all(disposers.map((f) => f())).then(teardown))

  test('emits messages over time as they become available', async () => {
    const streamId = v4()

    const processor = jest.fn()
    const disposer = jest.fn()
    const store = await getStore()
    await store.subscribeToAll(processor, {
      afterPosition: SubscribeAt.Beginning,
      dispose: disposer,
    })
    const messages1 = generateMessages(10)
    const appendResult = await store.appendToStream(
      streamId,
      ExpectedVersion.Empty,
      messages1
    )
    const messages2 = generateMessages(90)
    await store.appendToStream(streamId, appendResult.streamVersion, messages2)

    await waitUntil(() => processor.mock.calls.length >= 100)

    expect(processor).toHaveBeenCalledTimes(100)
    await store.dispose()
    expect(disposer).toHaveBeenCalledTimes(1)

    // This asserts the processor was called in order.
    const allMessages = [...messages1, ...messages2]
    allMessages.forEach((m, i) => {
      expect(processor.mock.calls[i][0].messageId).toBe(m.messageId)
    })
  })

  test('emits only for new messages', async () => {
    const streamId = v4()

    const processor1 = jest.fn()
    const processor2 = jest.fn()
    const store = await getStore()
    await store.subscribeToAll(processor2, {
      afterPosition: SubscribeAt.End,
    })
    const messages1 = generateMessages(10)
    const appendResult = await store.appendToStream(
      streamId,
      ExpectedVersion.Empty,
      messages1
    )
    await store.subscribeToAll(processor1, {
      afterPosition: SubscribeAt.End,
    })
    const messages2 = generateMessages(90)
    await store.appendToStream(streamId, appendResult.streamVersion, messages2)

    await waitUntil(
      () =>
        processor1.mock.calls.length >= 90 &&
        processor2.mock.calls.length >= 100
    )

    expect(processor1).toHaveBeenCalledTimes(90)
    expect(processor2).toHaveBeenCalledTimes(100)

    // This asserts the processor was called in order.
    messages2.forEach((m, i) => {
      expect(processor1.mock.calls[i][0].messageId).toBe(m.messageId)
    })
  })

  test('can have multiple subscriptions going', async () => {
    const streamId = v4()
    const store = await getStore()
    const processor1 = jest.fn()
    const processor2 = jest.fn()

    await store.appendToStream(
      streamId,
      ExpectedVersion.Empty,
      generateMessages(10)
    )

    await store.subscribeToAll(processor1, {
      afterPosition: SubscribeAt.Beginning,
    })
    await store.subscribeToAll(processor2, {
      afterPosition: SubscribeAt.Beginning,
    })

    await waitUntil(() => processor1.mock.calls.length >= 10)
    await waitUntil(() => processor2.mock.calls.length >= 10)

    expect(processor1).toHaveBeenCalledTimes(10)
    expect(processor2).toHaveBeenCalledTimes(10)
  })

  test('can start from anywhere in the stream', async () => {
    const streamId = v4()
    const store = await getStore()
    const processor = jest.fn()
    const caughtUpHandler = jest.fn()

    const messages1 = generateMessages(10)
    const messages2 = generateMessages(90)
    await store.appendToStream(streamId, ExpectedVersion.Empty, [
      ...messages1,
      ...messages2,
    ])
    await store.subscribeToAll(processor, {
      afterPosition: '49',
      onCaughtUpChanged: caughtUpHandler,
    })

    await waitUntil(() => processor.mock.calls.length >= 50)

    expect(processor).toHaveBeenCalledTimes(50)
    expect(caughtUpHandler).toHaveBeenNthCalledWith(1, false)
    expect(caughtUpHandler).toHaveBeenNthCalledWith(2, true)
  })

  test('drops subscription on processing error', async () => {
    const streamId = v4()
    const store = await getStore()
    const processor = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Oops'))

    const dropped = jest.fn()
    const messages1 = generateMessages(10)
    const messages2 = generateMessages(90)
    await store.appendToStream(streamId, ExpectedVersion.Empty, [
      ...messages1,
      ...messages2,
    ])
    await store.subscribeToAll(processor, {
      afterPosition: 49,
      onSubscriptionDropped: dropped,
    })

    await waitUntil(() => dropped.mock.calls.length >= 1)

    expect(dropped).toHaveBeenCalledTimes(1)
    expect(processor).toHaveBeenCalledTimes(2)
  })

  test('retries on pull errors', async () => {
    const streamId = v4()
    const errorMock = jest.fn()
    const store = await getStore({
      ...noopLogger,
      error: errorMock,
    })

    const processor = jest.fn()

    await store.subscribeToAll(processor, {
      afterPosition: SubscribeAt.End,
    })
    store.readAll = jest
      .fn(store.readAll)
      .mockRejectedValueOnce(new Error('Oh noes!'))

    await store.appendToStream(
      streamId,
      ExpectedVersion.Empty,
      generateMessages(100)
    )
    await waitUntil(() => processor.mock.calls.length >= 100)
    expect(errorMock).toHaveBeenCalled()
  })

  test('drops subscription when initial pull fails', async () => {
    const errorMock = jest.fn()
    const dropped = jest.fn()
    const store = await getStore({
      ...noopLogger,
      error: errorMock,
    })
    store.readHeadPosition = jest
      .fn(store.readHeadPosition)
      .mockRejectedValue(new Error('nope'))

    const processor = jest.fn()

    await store.subscribeToAll(processor, {
      afterPosition: SubscribeAt.End,
      onSubscriptionDropped: dropped,
    })

    await waitUntil(() => errorMock.mock.calls.length >= 1)

    expect(errorMock).toHaveBeenCalled()
    expect(dropped).toHaveBeenCalled()
  })
}
