import { createPostgresStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { filterExpiredTest } from '../../__acceptance__/stream-store.filterExpired.test'

filterExpiredTest(async () => ({
  store: createPostgresStreamStore({
    ...streamStoreCfg,
    reading: {
      filterExpiredMessages: true,
      metadataCacheTtl: 5
    }
  }),

  nonFilteringStore: createPostgresStreamStore({
    ...streamStoreCfg
  })
}))
