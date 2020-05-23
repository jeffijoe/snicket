import { StreamStore, StreamMetadataResult } from '../types/stream-store'

/**
 * Metadata cache.
 */
export interface MetadataCache {
  readStreamMetadata(streamId: string): Promise<StreamMetadataResult>
}

/**
 * Creates a metadata cache.
 *
 * @param readStreamMetadataImpl implementation of getting stream metadata.
 * @param ttl the time to live for each cache entry, in seconds
 * @param getCurrentTime current time getter
 */
export function createMetadataCache(
  readStreamMetadataImpl: StreamStore['readStreamMetadata'],
  ttl: number,
  getCurrentTime: () => Date | null
): MetadataCache {
  const cache = new Map<string, CacheEntry>()
  const getActualCurrentTime = () => getCurrentTime() || new Date()
  return {
    readStreamMetadata,
  }

  /**
   * Gets the stream metadata result from the cache if present, or from the source.
   *
   * @param streamId
   */
  async function readStreamMetadata(
    streamId: string
  ): Promise<StreamMetadataResult> {
    purgeCache()
    const entry = cache.get(streamId)
    if (entry) {
      return entry.resultPromise
    }

    const newEntry: CacheEntry = {
      expiresAt: new Date(getActualCurrentTime().getTime() + ttl * 1000),
      resultPromise: readStreamMetadataImpl(streamId),
    }
    cache.set(streamId, newEntry)
    return newEntry.resultPromise
  }

  /**
   * Purges the cache for expired entries.
   */
  function purgeCache() {
    for (const [key, entry] of Array.from(cache.entries())) {
      if (entry.expiresAt < getActualCurrentTime()) {
        cache.delete(key)
      }
    }
  }
}

interface CacheEntry {
  expiresAt: Date
  resultPromise: Promise<StreamMetadataResult>
}
