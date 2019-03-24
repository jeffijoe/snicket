import { v4 } from 'uuid'
import { createPostgresStreamStore, PgStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { ExpectedVersion } from '../../types/stream-store'
import { generateMessages } from './__helpers__/message-helper'
import { SubscribeAt } from '../../types/subscriptions'
import { delay } from '../../utils/promise-util'
import { noopLogger } from '../../logging/noop'
import { createResetEvent } from '../../utils/reset-event'

jest.setTimeout(50000)

let store: PgStreamStore

afterEach(() => store.dispose().catch(Boolean))

test('emits messages over time as they become available', async () => {
  const streamId = v4()
  store = createPostgresStreamStore(streamStoreCfg)
  const processor = jest.fn()
  const disposer = jest.fn()
  await store.subscribeToStream(streamId, processor, {
    afterVersion: SubscribeAt.Beginning,
    dispose: disposer
  })
  const messages1 = generateMessages(10)
  const appendResult = await store.appendToStream(
    streamId,
    ExpectedVersion.Empty,
    messages1
  )
  const messages2 = generateMessages(90)
  await store.appendToStream(streamId, appendResult.streamVersion, messages2)

  while (processor.mock.calls.length < 100) {
    await delay(50)
  }

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
  store = createPostgresStreamStore(streamStoreCfg)
  const earlier = jest.fn()
  const later = jest.fn()
  await store.subscribeToStream(streamId, earlier, {
    afterVersion: SubscribeAt.End
  })

  const messages1 = generateMessages(10)
  const appendResult = await store.appendToStream(
    streamId,
    ExpectedVersion.Empty,
    messages1
  )
  await store.subscribeToStream(streamId, later, {
    afterVersion: SubscribeAt.End
  })
  const messages2 = generateMessages(90)
  await store.appendToStream(streamId, appendResult.streamVersion, messages2)

  while (later.mock.calls.length < 90 || earlier.mock.calls.length < 100) {
    await delay(50)
  }

  expect(later).toHaveBeenCalledTimes(90)
  expect(earlier).toHaveBeenCalledTimes(100)

  // This asserts the processor was called in order.
  messages2.forEach((m, i) => {
    expect(later.mock.calls[i][0].messageId).toBe(m.messageId)
  })
})

test('can have multiple subscriptions going', async () => {
  const streamId = v4()
  store = createPostgresStreamStore(streamStoreCfg)
  const processor1 = jest.fn()
  const processor2 = jest.fn()

  await store.appendToStream(
    streamId,
    ExpectedVersion.Empty,
    generateMessages(10)
  )

  await store.subscribeToStream(streamId, processor1, {
    afterVersion: SubscribeAt.Beginning
  })
  await store.subscribeToStream(streamId, processor2, {
    afterVersion: SubscribeAt.Beginning
  })

  while (processor1.mock.calls.length < 10) {
    await delay(50)
  }

  while (processor2.mock.calls.length < 10) {
    await delay(50)
  }

  expect(processor1).toHaveBeenCalledTimes(10)
  expect(processor2).toHaveBeenCalledTimes(10)
})

test('can start from anywhere in the stream', async () => {
  const streamId = v4()
  store = createPostgresStreamStore(streamStoreCfg)
  const processor = jest.fn()
  const caughtUpHandler = jest.fn()

  const messages1 = generateMessages(10)
  const messages2 = generateMessages(90)
  await store.appendToStream(streamId, ExpectedVersion.Empty, [
    ...messages1,
    ...messages2
  ])
  await store.subscribeToStream(streamId, processor, {
    afterVersion: 49,
    onCaughtUpChanged: caughtUpHandler
  })

  while (processor.mock.calls.length < 50) {
    await delay(50)
  }

  expect(processor).toHaveBeenCalledTimes(50)
  expect(caughtUpHandler).toHaveBeenNthCalledWith(1, false)
  expect(caughtUpHandler).toHaveBeenNthCalledWith(2, true)
})

test('drops subscription on initialization error', async () => {
  const streamId = v4()
  const errorMock = jest.fn()
  store = createPostgresStreamStore({
    ...streamStoreCfg,
    logger: {
      ...noopLogger,
      error: errorMock
    }
  })
  const processor = jest.fn()

  const dropped = jest.fn()
  const messages1 = generateMessages(10)
  const messages2 = generateMessages(90)
  await store.appendToStream(streamId, ExpectedVersion.Empty, [
    ...messages1,
    ...messages2
  ])

  store.readStream = jest.fn(() => Promise.reject(new Error('Nope')))

  await store.subscribeToStream(streamId, processor, {
    afterVersion: SubscribeAt.End,
    onSubscriptionDropped: dropped
  })

  while (dropped.mock.calls.length < 1) {
    await delay(50)
  }

  expect(dropped).toHaveBeenCalledTimes(1)
  expect(processor).not.toHaveBeenCalled()
  expect(errorMock).toHaveBeenCalledTimes(1)
})

test('drops subscription on processing error', async () => {
  const streamId = v4()
  store = createPostgresStreamStore(streamStoreCfg)
  const processor = jest
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('Oops'))

  const dropped = jest.fn()
  const messages1 = generateMessages(10)
  const messages2 = generateMessages(90)
  await store.appendToStream(streamId, ExpectedVersion.Empty, [
    ...messages1,
    ...messages2
  ])
  await store.subscribeToStream(streamId, processor, {
    afterVersion: 49,
    onSubscriptionDropped: dropped
  })

  while (dropped.mock.calls.length < 1) {
    await delay(50)
  }

  expect(dropped).toHaveBeenCalledTimes(1)
  expect(processor).toHaveBeenCalledTimes(2)
})

test('retries on pull errors', async () => {
  const streamId = v4()
  const errorMock = jest.fn()
  store = createPostgresStreamStore({
    ...streamStoreCfg,
    logger: {
      ...noopLogger,
      error: errorMock
    }
  })

  const processor = jest.fn()

  await store.subscribeToStream(streamId, processor, {
    afterVersion: SubscribeAt.End
  })
  store.readStream = jest
    .fn(store.readStream)
    .mockRejectedValueOnce(new Error('Oh noes!'))

  await store.appendToStream(
    streamId,
    ExpectedVersion.Empty,
    generateMessages(100)
  )
  while (processor.mock.calls.length < 100) {
    await delay(50)
  }
  expect(errorMock).toHaveBeenCalled()
})

test('drops subscription when initial pull fails', async () => {
  const streamId = v4()
  const errorMock = jest.fn()
  const dropped = jest.fn()
  store = createPostgresStreamStore({
    ...streamStoreCfg,
    logger: {
      ...noopLogger,
      error: errorMock
    }
  })
  store.readStream = jest
    .fn(store.readStream)
    .mockRejectedValue(new Error('nope'))

  const processor = jest.fn()

  await store.subscribeToStream(streamId, processor, {
    afterVersion: SubscribeAt.End,
    onSubscriptionDropped: dropped
  })

  while (errorMock.mock.calls.length < 1) {
    await delay(50)
  }

  expect(errorMock).toHaveBeenCalled()
  expect(dropped).toHaveBeenCalled()
})

test('waits until all messages have been processed when disposing', async () => {
  const streamId = v4()
  store = createPostgresStreamStore(streamStoreCfg)

  const onFirst = createResetEvent()
  const processor = jest.fn(() => {
    onFirst.set()
    return delay(20)
  })

  await store.subscribeToStream(streamId, processor, {
    afterVersion: SubscribeAt.End
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
