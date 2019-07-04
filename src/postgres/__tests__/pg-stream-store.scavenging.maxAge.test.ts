import { createPostgresStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { scavengingMaxAgeTestsFor } from '../../__acceptance__/stream-store.scavenging.maxAge.test'

scavengingMaxAgeTestsFor(async getNow =>
  createPostgresStreamStore({
    ...streamStoreCfg,
    scavengeSynchronously: true,
    getCurrentTime: getNow
  })
)
