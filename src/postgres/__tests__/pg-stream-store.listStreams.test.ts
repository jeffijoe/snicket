import _ from 'lodash'
import { createPostgresStreamStoreBootstrapper } from '../setup/bootstrapper'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { createPostgresStreamStore } from '../pg-stream-store'
import { PgStreamStoreConfig } from '../types/config'
import { listStreamsTestsFor } from '../../__acceptance__/stream-store.listStreams.test'

const cfg: PgStreamStoreConfig = {
  ...streamStoreCfg,
  pg: {
    ...streamStoreCfg.pg,
    database: 'list_streams_test',
  },
}

const bootstrapper = createPostgresStreamStoreBootstrapper(cfg)

listStreamsTestsFor(
  async () =>
    bootstrapper.bootstrap().then(() => createPostgresStreamStore(cfg)),
  bootstrapper.teardown
)
