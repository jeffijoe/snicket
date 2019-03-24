import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { createPostgresStreamStoreBootstrapper } from '../setup/setup'
import { createPostgresStreamStore } from '../pg-stream-store'
import { v4 } from 'uuid'
import { ExpectedVersion, StreamStore } from '../../types/stream-store'

const cfg = {
  ...streamStoreCfg,
  pg: {
    ...streamStoreCfg.pg,
    dropIfTest: false,
    data: 'pg_stream_store_schema_test',
    schema: 'schematest'
  }
}

describe('schema', () => {
  test('can setup and teardown', async () => {
    const bootstrapper = createPostgresStreamStoreBootstrapper(cfg)
    await bootstrapper.teardown()
    await bootstrapper.bootstrap()

    let streamStore = createPostgresStreamStore(cfg)
    await append(streamStore)
    await streamStore.dispose()
    await bootstrapper.teardown()

    streamStore = createPostgresStreamStore(cfg)
    await expect(append(streamStore)).rejects.toMatchObject({
      message: expect.stringContaining('schematest')
    })
  })
})

function append(streamStore: StreamStore) {
  return streamStore.appendToStream(v4(), ExpectedVersion.Empty, [
    {
      messageId: v4(),
      data: {},
      meta: {},
      type: 'test'
    }
  ])
}
