import {
  PgStreamStoreConfig,
  createPostgresStreamStoreBootstrapper,
  createPostgresStreamStore
} from '..'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { subscribeToAllTestsFor } from '../../__acceptance__/stream-store.subscribeToAll.test'

jest.setTimeout(50000)

const cfg: PgStreamStoreConfig = {
  ...streamStoreCfg,
  pg: {
    ...streamStoreCfg.pg,
    database: 'all_stream_subscription_test'
  }
}

const bootstrapper = createPostgresStreamStoreBootstrapper(cfg)
subscribeToAllTestsFor(async logger => {
  await bootstrapper.teardown()
  await bootstrapper.bootstrap()
  return createPostgresStreamStore({ ...cfg, logger })
}, bootstrapper.teardown)
