import { createInMemoryStreamStore } from '../in-memory-stream-store'
import { idempotencyTestsFor } from '../../__acceptance__/stream-store.idempotency.test'

idempotencyTestsFor(async () => createInMemoryStreamStore())
