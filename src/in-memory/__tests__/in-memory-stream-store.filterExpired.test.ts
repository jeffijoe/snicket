import { filterExpiredTest } from '../../__acceptance__/stream-store.filterExpired.test'
import { createInMemoryStreamStore } from '../in-memory-stream-store'

filterExpiredTest(async () => {
  const store = createInMemoryStreamStore()
  return {
    store,
    nonFilteringStore: store,
  }
})
