import { deleteMessageTestFor } from '../../__acceptance__/stream-store.deleteMessage.test'
import { createInMemoryStreamStore } from '../in-memory-stream-store'

deleteMessageTestFor(async () => createInMemoryStreamStore())
