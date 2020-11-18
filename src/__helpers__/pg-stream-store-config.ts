import { PgStreamStoreConfig } from '../postgres/types/config'
import { noopLogger } from '../logging/noop'
import { createConsoleLogger } from '../logging/console'

export const streamStoreCfg: PgStreamStoreConfig = {
  /* istanbul ignore next */
  logger: process.env.LOG_TO_CONSOLE
    ? createConsoleLogger('trace')
    : noopLogger,
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
