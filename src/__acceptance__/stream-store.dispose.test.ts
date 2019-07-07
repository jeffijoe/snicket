import { StreamStore, ExpectedVersion, DisposedError } from '..'
import { v4 } from 'uuid'
import { noop } from 'lodash'

export function disposeTestsFor(
  getStore: () => Promise<StreamStore>,
  teardown?: () => Promise<unknown>
) {
  let store: StreamStore
  beforeAll(async () => {
    store = await getStore()
  })
  afterAll(() =>
    store
      .dispose()
      .catch(Boolean)
      .then(teardown)
  )

  test('waits for writes', async () => {
    const streamId = v4()
    // Make sure there's a subscription to dispose as well.
    await store.subscribeToStream(streamId, noop as any)
    const p = store.appendToStream(streamId, ExpectedVersion.Empty, [
      {
        messageId: v4(),
        data: {},
        type: 'test'
      }
    ])

    await store.dispose()
    const appendResult = await p
    expect(appendResult.streamVersion).toBe(0)

    await expect(
      store.appendToStream(streamId, ExpectedVersion.Empty, [
        {
          messageId: v4(),
          data: {},
          type: 'test'
        }
      ])
    ).rejects.toBeInstanceOf(DisposedError)

    await expect(store.dispose()).rejects.toBeInstanceOf(DisposedError)
  })
}
