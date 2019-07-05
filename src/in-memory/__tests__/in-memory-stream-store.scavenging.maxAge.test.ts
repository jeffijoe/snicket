import { scavengingMaxAgeTestsFor } from '../../__acceptance__/stream-store.scavenging.maxAge.test'
import { createInMemoryStreamStore } from '../in-memory-stream-store'

scavengingMaxAgeTestsFor(async getCurrentTime =>
  createInMemoryStreamStore({ getCurrentTime })
)
