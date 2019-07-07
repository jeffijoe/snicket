import { readStreamTestsFor } from '../../__acceptance__/stream-store.readStream.test'
import { createInMemoryStreamStore } from '../in-memory-stream-store'

readStreamTestsFor(async () => createInMemoryStreamStore())
