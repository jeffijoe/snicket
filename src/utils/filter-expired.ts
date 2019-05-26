import { StreamMessage } from '../types/messages'
import { isMetaStream } from './id-util'

/**
 * Filters out expired messages.
 *
 * @param messages
 * @param getCurrentTime
 */
export function filterExpiredMessages(
  messages: Array<{ message: StreamMessage; maxAge: number | null }>,
  getCurrentTime: () => Date | null
): { valid: Array<StreamMessage>; expired: Array<StreamMessage> } {
  const currentTime = getCurrentTime() || new Date()
  const valid: Array<StreamMessage> = []
  const expired: Array<StreamMessage> = []
  for (const { message, maxAge } of messages) {
    if (isMetaStream(message.streamId)) {
      valid.push(message)
      continue
    }

    if (!maxAge) {
      valid.push(message)
      continue
    }

    const withMaxAgeApplied = new Date(
      message.createdAt.getTime() + maxAge * 1000
    )

    if (withMaxAgeApplied > currentTime) {
      valid.push(message)
      continue
    }

    expired.push(message)
  }

  return { valid, expired }
}
