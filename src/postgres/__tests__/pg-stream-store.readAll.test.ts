import { createPostgresStreamStore } from '../pg-stream-store'
import { PgStreamStoreConfig } from '../types/config'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { createPostgresStreamStoreBootstrapper } from '../setup/bootstrapper'
import { readAllTestsFor } from '../../__acceptance__/stream-store.readAll.test'

let cfg: PgStreamStoreConfig = {
  ...streamStoreCfg,
  pg: {
    ...streamStoreCfg.pg,
    database: 'read_all_test'
  }
}

const bootstrapper = createPostgresStreamStoreBootstrapper(cfg)
readAllTestsFor(async () => {
  await bootstrapper.teardown()
  await bootstrapper.bootstrap()
  return createPostgresStreamStore(cfg)
}, bootstrapper.teardown)
