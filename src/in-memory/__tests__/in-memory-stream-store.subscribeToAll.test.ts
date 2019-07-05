import { subscribeToAllTestsFor } from '../../__acceptance__/stream-store.subscribeToAll.test'
import { createInMemoryStreamStore } from '../in-memory-stream-store'

subscribeToAllTestsFor(async logger => createInMemoryStreamStore({ logger }))
