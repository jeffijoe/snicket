import { ExpectedVersion, ReadDirection } from '../../types/stream-store'
import { createPostgresStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { v4 } from 'uuid'
import { generateMessages } from './__helpers__/message-helper'
import { OperationalStream, StreamDeleted } from '../../types/messages'
import { SubscribeAt } from '../../types/subscriptions'
import { ConcurrencyError } from '../../errors/errors'

const store = createPostgresStreamStore({
  ...streamStoreCfg,
  notifierConfig: {
    type: 'pg-notify'
  }
})
afterAll(() => store.dispose())

test('deletes a stream', async () => {
  const streamId = v4()
  const messages = generateMessages(5)
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

  await new Promise(async (resolve, reject) => {
    const sub = await store.subscribeToStream(
      OperationalStream.Deleted,
      async msg => {
        if ((msg.data as StreamDeleted).streamId === streamId) {
          sub.dispose().then(() => resolve(), reject)
        }
      },
      {
        afterVersion: SubscribeAt.Beginning,
        maxCountPerRead: 500
      }
    )
  })

  await new Promise(async (resolve, reject) => {
    const sub = await store.subscribeToAll(
      async msg => {
        if ((msg.data as StreamDeleted).streamId === streamId) {
          sub.dispose().then(() => resolve(), reject)
        }
      },
      {
        afterPosition: SubscribeAt.Beginning,
        maxCountPerRead: 500
      }
    )
  })
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
