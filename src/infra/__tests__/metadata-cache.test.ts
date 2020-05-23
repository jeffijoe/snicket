import { createMetadataCache } from '../metadata-cache'
import { StreamMetadataResult } from '../../types/stream-store'
import { createClock } from '../../__helpers__/clock'

test('gets from the cache', async () => {
  const clock = createClock()
  const readStreamMetadataImpl = jest.fn(
    async (streamId) =>
      ({
        streamId,
        maxAge: 1,
        maxCount: 1,
        metadata: {},
        metadataStreamVersion: 1,
      } as StreamMetadataResult)
  )

  const cache = createMetadataCache(readStreamMetadataImpl, 10, clock.get)

  expect((await cache.readStreamMetadata('s1')).streamId).toBe('s1')
  expect((await cache.readStreamMetadata('s2')).streamId).toBe('s2')
  expect(readStreamMetadataImpl).toHaveBeenCalledTimes(2)

  expect((await cache.readStreamMetadata('s1')).streamId).toBe('s1')
  expect(readStreamMetadataImpl).toHaveBeenCalledTimes(2)

  clock.tick('5 seconds')

  expect((await cache.readStreamMetadata('s1')).streamId).toBe('s1')
  expect(readStreamMetadataImpl).toHaveBeenCalledTimes(2)

  clock.tick('6 seconds')

  expect((await cache.readStreamMetadata('s1')).streamId).toBe('s1')
  expect(readStreamMetadataImpl).toHaveBeenCalledTimes(3)
})
