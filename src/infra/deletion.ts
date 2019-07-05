import { StreamDeleted } from '../types/messages'

/**
 * Creates the necessary payload for a StreamDeleted message.
 *
 * @param streamId
 */
export function createStreamDeletedPayload(streamId: string): StreamDeleted {
  return { streamId }
}
