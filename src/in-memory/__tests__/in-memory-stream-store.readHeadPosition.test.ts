import { readHeadPositionTestsFor } from '../../__acceptance__/stream-store.readHeadPosition.test'
import { createInMemoryStreamStore } from '../in-memory-stream-store'

readHeadPositionTestsFor(async () => createInMemoryStreamStore())
