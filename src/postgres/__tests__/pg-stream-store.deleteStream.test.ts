import { deleteStreamTestFor } from '../../__acceptance__/stream-store.deleteStream.test'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { createPostgresStreamStore } from '../pg-stream-store'
import { createPostgresStreamStoreBootstrapper } from '../setup/bootstrapper'
import { PgStreamStoreConfig } from '../types/config'

const cfg: PgStreamStoreConfig = {
  ...streamStoreCfg,
  pg: {
    ...streamStoreCfg.pg,
    database: 'delete_stream_test',
  },
  notifier: {
    type: 'pg-notify',
  },
}

const bootstrapper = createPostgresStreamStoreBootstrapper(cfg)
deleteStreamTestFor(
  () => bootstrapper.bootstrap().then(() => createPostgresStreamStore(cfg)),
  bootstrapper.teardown
)
