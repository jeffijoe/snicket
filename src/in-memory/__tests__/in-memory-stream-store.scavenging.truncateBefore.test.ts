import { scavengingTruncateBeforeTestsFor } from '../../__acceptance__/stream-store.scavenging.truncateBefore.test'

import { createInMemoryStreamStore } from '../in-memory-stream-store'

scavengingTruncateBeforeTestsFor(async () => createInMemoryStreamStore({}))
