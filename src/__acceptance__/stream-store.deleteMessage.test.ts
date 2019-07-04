import { v4 } from 'uuid'
import { ExpectedVersion, StreamStore } from '..'
import { generateMessages } from '../__helpers__/message-helper'

export function deleteMessageTestFor(
  getStore: () => Promise<StreamStore>,
  teardown?: () => Promise<unknown>
) {
  let store: StreamStore
  beforeAll(async () => {
    store = await getStore()
  })

  afterAll(() => store.dispose().then(teardown))

  test('deletes a message', async () => {
    const streamId = v4()
    const messages = generateMessages(5)
    await store.appendToStream(streamId, ExpectedVersion.Empty, messages)
    await store.deleteMessage(streamId, messages[0].messageId)
    const read = await store.readStream(streamId, 0, 100)
    expect(read.messages).toHaveLength(4)
  })
}
