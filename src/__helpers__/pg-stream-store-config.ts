import { PgStreamStoreConfig } from '../postgres/types/config'
import { noopLogger } from '../logging/noop'

export const streamStoreCfg: PgStreamStoreConfig = {
  logger: noopLogger,
  gapReloadDelay: 1000,
  pg: {
    dropIfTest: true,
    schema: 'streamsource',
    host: 'localhost',
    user: 'postgres',
    port: 20091,
    database: 'streams_test',
    password: ''
  }
}
