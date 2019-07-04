import {
  StreamStore,
  OperationalStream,
  StreamDeleted,
  ExpectedVersion,
  ReadDirection,
  WrongExpectedVersionError
} from '..'
import { v4 } from 'uuid'
import { generateMessages } from '../__helpers__/message-helper'
import {
  waitForStreamSubscription,
  waitForAllSubscription
} from '../__helpers__/wait-helper'

export function deleteStreamTestFor(
  getStore: () => Promise<StreamStore>,
  teardown?: () => Promise<unknown>
) {
  let store: StreamStore
  beforeAll(async () => {
    store = await getStore()
  })

  afterAll(() => store.dispose().then(teardown))

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
    ).rejects.toBeInstanceOf(WrongExpectedVersionError)
  })
}
