import { idempotencyTestsFor } from '../../__acceptance__/stream-store.idempotency.test'
import { createPostgresStreamStore } from '..'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'

idempotencyTestsFor(async () =>
  createPostgresStreamStore({ ...streamStoreCfg, logger: undefined })
)
