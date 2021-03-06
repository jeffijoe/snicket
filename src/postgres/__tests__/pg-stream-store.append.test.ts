import { createPostgresStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { appendTestFor } from '../../__acceptance__/stream-store.append.test'

appendTestFor(async () =>
  createPostgresStreamStore({ ...streamStoreCfg, logger: undefined })
)
