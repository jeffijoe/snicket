import {
  ExpectedVersion,
  ReadDirection,
  StreamStore
} from '../../types/stream-store'
import { createPostgresStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { v4 } from 'uuid'
import { generateMessages } from './__helpers__/message-helper'
import { OperationalStream, StreamDeleted } from '../../types/messages'
import { ConcurrencyError } from '../../errors/errors'
import { PgStreamStoreConfig } from '../types/config'
import { createPostgresStreamStoreBootstrapper } from '../setup/bootstrapper'
import {
  waitForStreamSubscription,
  waitForAllSubscription
} from '../../__helpers__/wait-helper'

const cfg: PgStreamStoreConfig = {
  ...streamStoreCfg,
  pg: {
    ...streamStoreCfg.pg,
    database: 'delete_stream_test'
  },
  notifier: {
    type: 'pg-notify'
  }
}

const bootstrapper = createPostgresStreamStoreBootstrapper(cfg)
let store: StreamStore
beforeAll(async () => {
  await bootstrapper.bootstrap()
  store = createPostgresStreamStore(cfg)
})

afterAll(() => store.dispose().then(bootstrapper.teardown))

test('deletes a stream', async () => {
  const streamId = v4()
  const messages = generateMessages(5)
  const subscriptionPromises = [
    waitForStreamSubscription(
      store,
      OperationalStream.Deleted,
      msg => (msg.data as StreamDeleted).streamId === streamId
    ),

    waitForAllSubscription(
      store,
      msg => (msg.data as StreamDeleted).streamId === streamId
    )
  ]

  const result = await store.appendToStream(
    streamId,
    ExpectedVersion.Empty,
    messages
  )
  await store.deleteStream(streamId, result.streamVersion)
  const read = await store.readStream(streamId, 0, 100)
  expect(read.messages).toHaveLength(0)

  const deletedMsgs = await store.readStream(
    OperationalStream.Deleted,
    0,
    9999999,
    ReadDirection.Forward
  )

  expect(
    deletedMsgs.messages.find(
      m => (m.data as StreamDeleted).streamId === streamId
    )
  ).toBeTruthy()

  await Promise.all(subscriptionPromises)
})

test('detects concurrency issues', async () => {
  const streamId = v4()
  const messages = generateMessages(5)
  const result = await store.appendToStream(
    streamId,
    ExpectedVersion.Empty,
    messages
  )
  await expect(
    store.deleteStream(streamId, result.streamVersion - 1)
  ).rejects.toBeInstanceOf(ConcurrencyError)
})
