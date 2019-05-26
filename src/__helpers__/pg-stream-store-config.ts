import { PgStreamStoreConfig } from '../postgres/types/config'
import { env } from './env'
import { noopLogger } from '../logging/noop'

export const streamStoreCfg: PgStreamStoreConfig = {
  logger: noopLogger,
  gapReloadDelay: 1000,
  pg: {
    dropIfTest: true,
    schema: env.STREAMS_PG_SCHEMA,
    host: env.STREAMS_PG_HOST,
    user: env.STREAMS_PG_USER,
    port: env.STREAMS_PG_PORT,
    database: env.STREAMS_PG_DATABASE,
    password: env.STREAMS_PG_USER
  }
}
