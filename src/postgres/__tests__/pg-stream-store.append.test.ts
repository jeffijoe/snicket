import _ from 'lodash'
import { createPostgresStreamStore, PgStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { appendTestFor } from '../../__acceptance__/stream-store.append.test'

appendTestFor(async () =>
  createPostgresStreamStore({ ...streamStoreCfg, logger: undefined })
)
