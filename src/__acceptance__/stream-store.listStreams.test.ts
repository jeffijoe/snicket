import { StreamStore, ExpectedVersion } from '..'
import _ from 'lodash'
import { generateMessages } from '../__helpers__/message-helper'
import { v4 } from 'uuid'

export function listStreamsTestsFor(
  getStore: () => Promise<StreamStore>,
  teardown?: () => Promise<unknown>
) {
  let store: StreamStore
  beforeAll(async () => {
    store = await getStore()
  })

  afterAll(() => store.dispose().then(teardown))

  test('listStreams', async () => {
    const empty = await store.listStreams(10)
    expect(empty.streamIds).toHaveLength(0)

    await Promise.all(
      _.range(20).map(() =>
        store.appendToStream(v4(), ExpectedVersion.Empty, generateMessages(5))
      )
    )

    const firstPage = await store.listStreams(10)
    expect(firstPage.streamIds).toHaveLength(10)
    // Assert the stream IDs point to the streams we created.
    await Promise.all(
      firstPage.streamIds.map(streamId =>
        expect(
          store.readStream(streamId, 0, 10).then(r => r.messages)
        ).resolves.toHaveLength(5)
      )
    )

    const secondPage = await store.listStreams(15, firstPage.cursor)
    expect(secondPage.streamIds).toHaveLength(10)
    await Promise.all(
      secondPage.streamIds.map(streamId =>
        expect(
          store.readStream(streamId, 0, 10).then(r => r.messages)
        ).resolves.toHaveLength(5)
      )
    )

    const thirdPage = await store.listStreams(15, secondPage.cursor)
    expect(thirdPage.streamIds).toHaveLength(0)
  })
}
