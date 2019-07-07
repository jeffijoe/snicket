import { listStreamsTestsFor } from '../../__acceptance__/stream-store.listStreams.test'
import { createInMemoryStreamStore } from '../in-memory-stream-store'

listStreamsTestsFor(async () => createInMemoryStreamStore())
