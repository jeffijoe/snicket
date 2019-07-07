import { metadataTestsFor } from '../../__acceptance__/stream-store.metadata.test'
import { createInMemoryStreamStore } from '../in-memory-stream-store'

metadataTestsFor(async () => createInMemoryStreamStore())
