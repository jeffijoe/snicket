import { disposeTestsFor } from '../../__acceptance__/stream-store.dispose.test'
import { createInMemoryStreamStore } from '..'

disposeTestsFor(async () => createInMemoryStreamStore())
