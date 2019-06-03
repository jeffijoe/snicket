import { v4 } from 'uuid'
import { createPostgresStreamStore, PgStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { ExpectedVersion } from '../../types/stream-store'
import { generateMessages } from './__helpers__/message-helper'
import { SubscribeAt } from '../../types/subscriptions'
import { delay } from '../../utils/promise-util'
import { noopLogger } from '../../logging/noop'
import { PgStreamStoreConfig } from '../types/config'
import { createPostgresStreamStoreBootstrapper } from '../setup/setup'
import { waitUntil } from '../../__helpers__/wait-helper'

jest.setTimeout(50000)

const cfg: PgStreamStoreConfig = {
  ...streamStoreCfg,
  notifier: {
    type: 'pg-notify',
    keepAliveInterval: 10
  },
  pg: {
    ...streamStoreCfg.pg,
    database: 'pg-notifications-test'
  }
}

let store: PgStreamStore

const bootstrapper = createPostgresStreamStoreBootstrapper(cfg)
beforeEach(async () => {
  await bootstrapper.teardown()
  await bootstrapper.bootstrap()
})

afterEach(async () => {
  await store.dispose().catch(Boolean)
  await bootstrapper.teardown()
})

test('can use the postgres notifier', async () => {
  const streamId = v4()
  store = createPostgresStreamStore(cfg)
  const processor = jest.fn()
  const disposer = jest.fn()
  await store.subscribeToAll(processor, {
    afterPosition: SubscribeAt.Beginning,
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

test('pg notifier is faster than polling', async () => {
  const streamId = v4()
  const appendStore = createPostgresStreamStore(cfg)

  const pollingStore = createPostgresStreamStore({
    ...cfg,
    notifier: {
      type: 'poll',
      pollingInterval: 200 // This is a relatively high frequency for polling
    }
  })

  const pgNotifyStore = createPostgresStreamStore({
    ...cfg,
    notifier: {
      type: 'pg-notify',
      keepAliveInterval: 5000
    }
  })
  let last = ''
  const pgNotifyHandler = jest.fn(async () => {
    last = 'pg'
  })
  const pollingHandler = jest.fn(async () => {
    last = 'poll'
  })

  await pgNotifyStore.subscribeToAll(pgNotifyHandler)
  await pollingStore.subscribeToAll(pollingHandler)

  await appendStore.appendToStream(
    streamId,
    ExpectedVersion.Any,
    generateMessages(50)
  )
  await appendStore.appendToStream(
    streamId,
    ExpectedVersion.Any,
    generateMessages(50)
  )

  await waitUntil(() => pgNotifyHandler.mock.calls.length === 100)
  await waitUntil(() => pollingHandler.mock.calls.length === 100)

  expect(last).toBe('poll')

  await Promise.all([
    appendStore.dispose(),
    pollingStore.dispose(),
    pgNotifyStore.dispose()
  ])
})
