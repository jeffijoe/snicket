import { createPostgresStreamStoreBootstrapper } from '../postgres/setup/setup'
import { streamStoreCfg } from './pg-stream-store-config'
import { createConsoleLogger } from '../logging/console'

createPostgresStreamStoreBootstrapper({
  ...streamStoreCfg,
  logger: createConsoleLogger((process.env.LOG_LEVEL as any) || 'error')
})
  .bootstrap()
  .catch(() => process.exit(1))
