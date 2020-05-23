import { createPostgresStreamStoreBootstrapper } from '../setup/bootstrapper'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { createPostgresStreamStore } from '../pg-stream-store'
import { PgStreamStoreConfig } from '../types/config'
import { readHeadPositionTestsFor } from '../../__acceptance__/stream-store.readHeadPosition.test'

const cfg = {
  ...streamStoreCfg,
  pg: {
    ...streamStoreCfg.pg,
    database: 'read_head_position_test',
  },
} as PgStreamStoreConfig

const bootstrapper = createPostgresStreamStoreBootstrapper(cfg)

readHeadPositionTestsFor(async () => {
  await bootstrapper.teardown()
  await bootstrapper.bootstrap()
  return createPostgresStreamStore(cfg)
}, bootstrapper.teardown)
