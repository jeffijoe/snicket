import { createPostgresStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { filterExpiredTest } from '../../__acceptance__/stream-store.filterExpired.test'
import { PgStreamStoreConfig } from '../types/config'
import { createPostgresStreamStoreBootstrapper } from '../setup/bootstrapper'

const cfg: PgStreamStoreConfig = {
  ...streamStoreCfg,
  pg: {
    ...streamStoreCfg.pg,
    database: 'filter_expired_test'
  }
}

const bootstrapper = createPostgresStreamStoreBootstrapper(cfg)
filterExpiredTest(async () => {
  await bootstrapper.teardown()
  await bootstrapper.bootstrap()
  return {
    store: createPostgresStreamStore({
      ...cfg,
      reading: {
        filterExpiredMessages: true,
        metadataCacheTtl: 5
      }
    }),

    nonFilteringStore: createPostgresStreamStore({
      ...cfg
    })
  }
}, bootstrapper.teardown)
