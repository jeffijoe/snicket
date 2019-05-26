/**
 * Converts a stream ID to a metadata stream ID.
 * @param streamId
 */
export function toMetadataStreamId(streamId: string) {
  return `$$${streamId}`
}

/**
 * Determines if the specified stream ID is a meta stream.
 */
export function isMetaStream(streamId: string) {
  return streamId.startsWith('$')
}
