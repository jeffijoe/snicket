import { createPostgresStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { metadataTestsFor } from '../../__acceptance__/stream-store.metadata.test'

metadataTestsFor(async () =>
  createPostgresStreamStore({ ...streamStoreCfg, logger: undefined })
)
