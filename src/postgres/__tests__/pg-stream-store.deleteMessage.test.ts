import { StreamStore, ExpectedVersion } from '../../types/stream-store'
import { createPostgresStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { v4 } from 'uuid'
import { generateMessages } from './__helpers__/message-helper'

const store = createPostgresStreamStore(streamStoreCfg)
afterAll(() => store.dispose())

test('deletes a message', async () => {
  const streamId = v4()
  const messages = generateMessages(5)
  await store.appendToStream(streamId, ExpectedVersion.Empty, messages)
  await store.deleteMessage(streamId, messages[0].messageId)
  const read = await store.readStream(streamId, 0, 100)
  expect(read.messages).toHaveLength(4)
})
