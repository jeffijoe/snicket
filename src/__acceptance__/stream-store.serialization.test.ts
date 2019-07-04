import { MessageDataSerializer } from '../types/serialization'
import { StreamStore, createJsonSerializer, ExpectedVersion } from '..'
import { v4 } from 'uuid'
import { generateMessages } from '../__helpers__/message-helper'
import {
  waitForStreamSubscription,
  waitForAllSubscription
} from '../__helpers__/wait-helper'

export function serializationTestsFor(
  getStore: (serializer: MessageDataSerializer) => Promise<StreamStore>,
  teardown?: () => Promise<unknown>
) {
  let store: StreamStore
  beforeAll(async () => {
    store = await getStore(createJsonSerializer({ reviveDates: true }))
  })

  afterAll(() => store.dispose().then(teardown))

  test('serialization with date reviver', async () => {
    const streamId = v4()
    const messages = [
      {
        ...generateMessages(1)[0],
        data: {
          itsA: new Date(10)
        },
        meta: {
          metadate: new Date(20)
        }
      },
      {
        ...generateMessages(1)[0],
        data: [{ wo: 'ah' }]
      },
      {
        ...generateMessages(1)[0],
        data: 'woah'
      },
      {
        ...generateMessages(1)[0],
        data: ['woah']
      }
    ]
    await store.appendToStream(streamId, ExpectedVersion.Empty, messages)
    const streamPage = await store.readStream(streamId, 0, 10)
    expect(streamPage.messages[0].data.itsA).toStrictEqual(new Date(10))
    expect(streamPage.messages[0].meta.metadate).toStrictEqual(new Date(20))

    const allPage = await store.readAll(0, 10)
    expect(allPage.messages[0].data.itsA).toStrictEqual(new Date(10))
    expect(allPage.messages[0].meta.metadate).toStrictEqual(new Date(20))
    expect(allPage.messages[1].data[0].wo).toStrictEqual('ah')
    expect(allPage.messages[2].data).toStrictEqual('woah')
    expect(allPage.messages[3].data[0]).toStrictEqual('woah')

    await waitForStreamSubscription(
      store,
      streamId,
      msg =>
        msg.data.itsA.valueOf() === new Date(10).valueOf() &&
        msg.meta.metadate.valueOf() === new Date(20).valueOf()
    )
    await waitForAllSubscription(
      store,
      msg =>
        msg.data.itsA.valueOf() === new Date(10).valueOf() &&
        msg.meta.metadate.valueOf() === new Date(20).valueOf()
    )
  })
}
