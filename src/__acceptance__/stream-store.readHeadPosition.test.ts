import { v4 } from 'uuid'
import { ExpectedVersion, StreamStore } from '..'
import { generateMessages } from '../__helpers__/message-helper'

export function readHeadPositionTestsFor(
  getStore: () => Promise<StreamStore>,
  teardown?: () => Promise<unknown>
) {
  let store: StreamStore
  beforeAll(async () => {
    store = await getStore()
  })

  afterAll(() => store.dispose().then(teardown))

  describe('readHeadPosition', () => {
    test('returns the correct position', async () => {
      const streamId1 = v4()
      const streamId2 = v4()
      await Promise.all([
        store.appendToStream(
          streamId1,
          ExpectedVersion.Empty,
          generateMessages(10)
        ),
        store.appendToStream(
          streamId2,
          ExpectedVersion.Empty,
          generateMessages(10)
        ),
      ])

      const pos1 = await store.readHeadPosition()
      expect(pos1).toBe('19')

      await Promise.all([
        store.appendToStream(
          streamId1,
          ExpectedVersion.Any,
          generateMessages(10)
        ),
        store.appendToStream(
          streamId2,
          ExpectedVersion.Any,
          generateMessages(10)
        ),
      ])

      const pos2 = await store.readHeadPosition()
      expect(pos2).toBe('39')
    })
  })
}
