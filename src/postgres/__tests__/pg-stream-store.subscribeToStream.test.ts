import { subscribeToStreamTestsFor } from '../../__acceptance__/stream-store.subscribeToStream.test'
import { createPostgresStreamStore } from '..'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'

jest.setTimeout(50000)

subscribeToStreamTestsFor(async logger => {
  return createPostgresStreamStore({ ...streamStoreCfg, logger })
})
