import { createPostgresStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { readStreamTestsFor } from '../../__acceptance__/stream-store.readStream.test'

readStreamTestsFor(async () =>
  createPostgresStreamStore({ ...streamStoreCfg, logger: undefined })
)
