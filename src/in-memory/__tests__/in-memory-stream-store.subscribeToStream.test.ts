import { subscribeToStreamTestsFor } from '../../__acceptance__/stream-store.subscribeToStream.test'
import { createInMemoryStreamStore } from '../in-memory-stream-store'

jest.setTimeout(50000)

subscribeToStreamTestsFor(async (logger) => {
  return createInMemoryStreamStore({ logger })
})
