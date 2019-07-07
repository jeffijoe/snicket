import { scavengingMaxCountTestsFor } from '../../__acceptance__/stream-store.scavenging.maxCount.test'
import { createInMemoryStreamStore } from '../in-memory-stream-store'

scavengingMaxCountTestsFor(async () => createInMemoryStreamStore({}))
