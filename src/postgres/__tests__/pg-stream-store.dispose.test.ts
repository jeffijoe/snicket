import { createPostgresStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { v4 } from 'uuid'
import { ExpectedVersion } from '../../types/stream-store'
import { DisposedError } from '../../errors/errors'

test('waits for writes', async () => {
  const store = createPostgresStreamStore({
    ...streamStoreCfg,
    logger: undefined
  })
  const streamId = v4()
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
})
