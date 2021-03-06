import { delay } from 'fejl'
import { v4 } from 'uuid'
import {
  ExpectedVersion,
  Logger,
  noopLogger,
  StreamStore,
  SubscribeAt,
} from '..'
import { createResetEvent } from '../utils/reset-event'
import { generateMessages } from '../__helpers__/message-helper'
import { waitUntil } from '../__helpers__/wait-helper'

jest.setTimeout(50000)

export function subscribeToStreamTestsFor(
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
    const store = await getStore()
    const processor = jest.fn()
    const disposer = jest.fn()
    await store.subscribeToStream(streamId, processor, {
      afterVersion: SubscribeAt.Beginning,
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
    const store = await getStore()
    const earlier = jest.fn()
    const later = jest.fn()
    await store.subscribeToStream(streamId, earlier, {
      afterVersion: SubscribeAt.End,
    })

    const messages1 = generateMessages(10)
    const appendResult = await store.appendToStream(
      streamId,
      ExpectedVersion.Empty,
      messages1
    )
    await store.subscribeToStream(streamId, later, {
      afterVersion: SubscribeAt.End,
    })
    const messages2 = generateMessages(90)
    await store.appendToStream(streamId, appendResult.streamVersion, messages2)

    await waitUntil(
      () => later.mock.calls.length >= 90 && earlier.mock.calls.length >= 100
    )

    expect(earlier).toHaveBeenCalledTimes(100)
    expect(later).toHaveBeenCalledTimes(90)

    // This asserts the processor was called in order.
    messages2.forEach((m, i) => {
      expect(later.mock.calls[i][0].messageId).toBe(m.messageId)
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

    await store.subscribeToStream(streamId, processor1, {
      afterVersion: SubscribeAt.Beginning,
    })
    await store.subscribeToStream(streamId, processor2, {
      afterVersion: SubscribeAt.Beginning,
    })

    await waitUntil(
      () =>
        processor1.mock.calls.length >= 10 && processor2.mock.calls.length >= 10
    )

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
    await store.subscribeToStream(streamId, processor, {
      afterVersion: 49,
      onCaughtUpChanged: caughtUpHandler,
    })

    await waitUntil(() => processor.mock.calls.length >= 50)

    expect(processor).toHaveBeenCalledTimes(50)
    expect(caughtUpHandler).toHaveBeenNthCalledWith(1, false)
    expect(caughtUpHandler).toHaveBeenNthCalledWith(2, true)
  })

  test('drops subscription on initialization error', async () => {
    const streamId = v4()
    const errorMock = jest.fn()
    const store = await getStore({
      ...noopLogger,
      error: errorMock,
    })
    const processor = jest.fn()

    const dropped = jest.fn()
    const messages1 = generateMessages(10)
    const messages2 = generateMessages(90)
    await store.appendToStream(streamId, ExpectedVersion.Empty, [
      ...messages1,
      ...messages2,
    ])

    store.readStream = jest.fn(() => Promise.reject(new Error('Nope')))

    await store.subscribeToStream(streamId, processor, {
      afterVersion: SubscribeAt.End,
      onSubscriptionDropped: dropped,
    })

    await waitUntil(() => dropped.mock.calls.length >= 1)

    expect(dropped).toHaveBeenCalledTimes(1)
    expect(processor).not.toHaveBeenCalled()
    expect(errorMock).toHaveBeenCalledTimes(1)
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
    await store.subscribeToStream(streamId, processor, {
      afterVersion: 49,
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

    await store.subscribeToStream(streamId, processor, {
      afterVersion: SubscribeAt.End,
    })
    store.readStream = jest
      .fn(store.readStream)
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
    const streamId = v4()
    const errorMock = jest.fn()
    const dropped = jest.fn()
    const store = await getStore({
      ...noopLogger,
      error: errorMock,
    })
    store.readStream = jest
      .fn(store.readStream)
      .mockRejectedValue(new Error('nope'))

    const processor = jest.fn()

    await store.subscribeToStream(streamId, processor, {
      afterVersion: SubscribeAt.End,
      onSubscriptionDropped: dropped,
    })
    await waitUntil(() => errorMock.mock.calls.length >= 1)

    expect(errorMock).toHaveBeenCalled()
    expect(dropped).toHaveBeenCalled()
  })

  test('waits until all messages have been processed when disposing', async () => {
    const streamId = v4()
    const store = await getStore()

    const onFirst = createResetEvent()
    const processor = jest.fn(() => {
      onFirst.set()
      return delay(20)
    })

    await store.subscribeToStream(streamId, processor, {
      afterVersion: SubscribeAt.End,
    })

    await store.appendToStream(
      streamId,
      ExpectedVersion.Empty,
      generateMessages(10)
    )

    await onFirst.wait()
    await store.dispose()
    expect(processor).toHaveBeenCalledTimes(10)
  })
}
