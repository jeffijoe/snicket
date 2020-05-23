import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { createPostgresStreamStoreBootstrapper } from '../setup/bootstrapper'
import { createPostgresStreamStore } from '../pg-stream-store'
import { v4 } from 'uuid'
import { ExpectedVersion, StreamStore } from '../../types/stream-store'

const cfg = {
  ...streamStoreCfg,
  pg: {
    ...streamStoreCfg.pg,
    dropIfTest: false,
    data: 'pg_stream_store_schema_test',
    schema: 'schematest',
  },
}

describe('schema', () => {
  test('can setup and teardown', async () => {
    const bootstrapper = createPostgresStreamStoreBootstrapper(cfg)
    await bootstrapper.teardown()
    expect(await bootstrapper.getSchemaInfo()).toEqual({ version: 0 })

    await bootstrapper.bootstrap()
    // Do it again to make sure it didn't break anything.
    await bootstrapper.bootstrap()
    expect(await bootstrapper.getSchemaInfo()).toEqual({ version: 1 })

    let streamStore = createPostgresStreamStore(cfg)
    await append(streamStore)
    await streamStore.dispose()
    await bootstrapper.teardown()

    expect(await bootstrapper.getSchemaInfo()).toEqual({ version: 0 })

    streamStore = createPostgresStreamStore(cfg)
    await expect(append(streamStore)).rejects.toMatchObject({
      message: expect.stringContaining('schematest'),
    })
    await streamStore.dispose()
  })
})

function append(streamStore: StreamStore) {
  return streamStore.appendToStream(v4(), ExpectedVersion.Empty, [
    {
      messageId: v4(),
      data: {},
      meta: {},
      type: 'test',
    },
  ])
}
