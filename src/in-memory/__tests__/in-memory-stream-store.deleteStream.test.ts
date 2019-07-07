import { deleteStreamTestFor } from '../../__acceptance__/stream-store.deleteStream.test'
import { createInMemoryStreamStore } from '../in-memory-stream-store'

deleteStreamTestFor(async () => createInMemoryStreamStore())
