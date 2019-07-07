import { createPostgresStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { disposeTestsFor } from '../../__acceptance__/stream-store.dispose.test'

disposeTestsFor(async () =>
  createPostgresStreamStore({ ...streamStoreCfg, logger: undefined })
)
