import { createPostgresStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { deleteMessageTestFor } from '../../__acceptance__/stream-store.deleteMessage.test'
import { PgStreamStoreConfig } from '../types/config'
import { createPostgresStreamStoreBootstrapper } from '../setup/bootstrapper'

const cfg: PgStreamStoreConfig = {
  ...streamStoreCfg,
  pg: {
    ...streamStoreCfg.pg,
    database: 'delete_message_test'
  }
}
const bootstrapper = createPostgresStreamStoreBootstrapper(cfg)
deleteMessageTestFor(async () => {
  await bootstrapper.teardown()
  await bootstrapper.bootstrap()
  return createPostgresStreamStore(cfg)
}, bootstrapper.teardown)
