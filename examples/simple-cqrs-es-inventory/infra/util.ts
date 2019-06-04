import { StreamStore, StreamMessage } from 'snicket'

/**
 * Reads a stream to the end.
 *
 * @param store
 * @param streamId
 */
export async function readStreamToEnd(store: StreamStore, streamId: string) {
  const result: StreamMessage[] = []
  let readResult
  let nextVersion = 0
  do {
    readResult = await store.readStream(streamId, nextVersion, 100)
    nextVersion = readResult.nextVersion
    result.push(...readResult.messages)
    if (readResult.isEnd) {
      return { messages: result, version: readResult.streamVersion }
    }
  } while (true)
}

/**
 * Creates a stream ID.
 * @param type
 * @param id
 */
export function toStreamId(type: string, id: string) {
  return type + '-' + id
}

/**
 * Gets the ID portion of a stream ID.
 * @param id
 */
export function fromStreamId(id: string) {
  const idx = id.indexOf('-')
  return id.substring(idx + 1)
}
