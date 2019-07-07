import { appendTestFor } from '../../__acceptance__/stream-store.append.test'
import { createInMemoryStreamStore } from '../in-memory-stream-store'

appendTestFor(async () => createInMemoryStreamStore())
