import { scavengingTruncateBeforeTestsFor } from '../../__acceptance__/stream-store.scavenging.truncateBefore.test'
import { createPostgresStreamStore } from '..'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'

scavengingTruncateBeforeTestsFor(async () =>
  createPostgresStreamStore({
    ...streamStoreCfg,
    scavengeSynchronously: true
  })
)
