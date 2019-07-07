import { serializationTestsFor } from '../../__acceptance__/stream-store.serialization.test'
import { createInMemoryStreamStore } from '../in-memory-stream-store'

serializationTestsFor(async serializer =>
  createInMemoryStreamStore({ serializer })
)
