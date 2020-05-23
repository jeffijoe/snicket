import { PgStreamStoreConfig } from '../postgres/types/config'
import { noopLogger } from '../logging/noop'

export const streamStoreCfg: PgStreamStoreConfig = {
  logger: noopLogger,
  gapReloadDelay: 1000,
  pg: {
    dropIfTest: true,
    schema: 'snicket',
    host: 'localhost',
    user: 'postgres',
    port: process.env.PGPORT || /* istanbul ignore next */ 20091,
    database: 'streams_test',
    password: '',
  },
}
