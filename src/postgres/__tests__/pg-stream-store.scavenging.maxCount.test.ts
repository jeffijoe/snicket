import { scavengingMaxCountTestsFor } from '../../__acceptance__/stream-store.scavenging.maxCount.test'
import { createPostgresStreamStore } from '..'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'

scavengingMaxCountTestsFor(async () =>
  createPostgresStreamStore({
    ...streamStoreCfg,
    scavengeSynchronously: true,
  })
)
