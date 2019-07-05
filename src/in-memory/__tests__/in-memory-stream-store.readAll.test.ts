import { createInMemoryStreamStore } from '../in-memory-stream-store'
import { readAllTestsFor } from '../../__acceptance__/stream-store.readAll.test'

readAllTestsFor(async () => createInMemoryStreamStore())
