import {
  PgStreamStoreConfig,
  createPostgresStreamStoreBootstrapper,
  createPostgresStreamStore,
} from '..'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { serializationTestsFor } from '../../__acceptance__/stream-store.serialization.test'

const cfg: PgStreamStoreConfig = {
  ...streamStoreCfg,
  pg: {
    ...streamStoreCfg.pg,
    database: 'serialize_test',
  },
  notifier: {
    type: 'pg-notify',
  },
}

const bootstrapper = createPostgresStreamStoreBootstrapper(cfg)
serializationTestsFor(async (serializer) => {
  await bootstrapper.bootstrap()
  return createPostgresStreamStore({
    ...cfg,
    serializer,
  })
}, bootstrapper.teardown)
