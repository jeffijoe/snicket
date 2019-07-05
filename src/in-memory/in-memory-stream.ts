import BigInteger from 'big-integer'
import { NewStreamMessage } from '../types/messages'
import { ExpectedVersion } from '../types/stream-store'
import { WrongExpectedVersionError } from '../errors/errors'
import { MessageDataSerializer } from '../types/serialization'

/**
 * The internal representation of an in-memory message stream.
 *
 * @private
 * @param id
 * @param serializer
 * @param inMemoryAllStream
 * @param onStreamAppended
 * @param getNextHeadPosition
 * @param getCurrentTime
 */
export interface InMemoryStream {
  id: string
  streamVersion: number
  position: BigInteger.BigInteger
  messages: InMemoryStreamMessage[]
  appendToStream(expectedVersion: number, newMessages: NewStreamMessage[]): void
  deleteMessage(messageId: string): void
  deleteAllMessages(): void
}

/**
 * Internal message format.
 *
 * @private
 */
export interface InMemoryStreamMessage {
  messageId: string
  position: BigInteger.BigInteger
  data: string
  type: string
  createdAt: Date
  streamId: string
  streamVersion: number
  meta: string
}

/**
 * Creates an in-memory stream.
 *
 * @private
 * @param id
 * @param serializer
 * @param inMemoryAllStream
 * @param onStreamAppended
 * @param getNextHeadPosition
 * @param getCurrentTime
 */
export function createInMemoryStream(
  id: string,
  serializer: MessageDataSerializer,
  inMemoryAllStream: Array<InMemoryStreamMessage>,
  onStreamAppended: () => void,
  getNextHeadPosition: () => BigInteger.BigInteger,
  getCurrentTime: () => Date
): InMemoryStream {
  const messages: InMemoryStreamMessage[] = []
  const messageMap = new Map<string, InMemoryStreamMessage>()
  const stream: InMemoryStream = {
    id,
    streamVersion: -1,
    position: BigInteger(-1),
    messages,
    appendToStream,
    deleteMessage,
    deleteAllMessages
  }

  return stream

  function appendToStream(
    expectedVersion: number,
    newMessages: NewStreamMessage[]
  ): void {
    if (expectedVersion === ExpectedVersion.Any) {
      appendToStreamExpectedVersionAny(newMessages)
      return
    }

    appendToStreamAtVersion(expectedVersion, newMessages)
  }

  function appendToStreamAtVersion(
    expectedVersion: number,
    newMessages: NewStreamMessage[]
  ): void {
    let currentVersion = stream.streamVersion
    if (expectedVersion > currentVersion) {
      throw new WrongExpectedVersionError()
    }

    if (currentVersion >= 0 && expectedVersion < currentVersion) {
      // Expected version is less than current version, check idempotency.
      const startPos = messages.findIndex(
        m => m.streamVersion >= expectedVersion
      )

      /* istanbul ignore next: this shouldn't happen */
      if (startPos === -1) {
        throw new WrongExpectedVersionError()
      }

      // Make sure that there are no new messages being written
      throwOnOverlappingWrite(
        expectedVersion === -1 ? startPos : startPos + 1,
        newMessages
      )
      return
    }

    // At this point, we've established that expectedVersion == currentVersion
    // Check for duplicate IDs.
    if (newMessages.some(n => messageMap.has(n.messageId))) {
      throw new WrongExpectedVersionError()
    }

    appendMessages(newMessages)
  }

  function appendToStreamExpectedVersionAny(
    newMessages: NewStreamMessage[]
  ): void {
    if (newMessages.length > 0) {
      // Idempotency — check if messages have already been written
      const existingFirstMessage = messageMap.get(newMessages[0].messageId)
      if (existingFirstMessage) {
        // The first new message was found in the stream.
        // Check if it's an idempotent write.
        const startPos = messages.indexOf(existingFirstMessage)
        throwOnOverlappingWrite(startPos, newMessages)
        return
      }

      // The first message was not found in the stream, so if any others are, it's an issue.
      if (newMessages.some(m => messageMap.has(m.messageId))) {
        throw new WrongExpectedVersionError()
      }
    }

    appendMessages(newMessages)
  }

  function deleteMessage(messageId: string) {
    const message = messageMap.get(messageId)
    if (!message) {
      return
    }

    messages.splice(messages.indexOf(message), 1)
    messageMap.delete(messageId)
    inMemoryAllStream.splice(inMemoryAllStream.indexOf(message), 1)
  }

  function throwOnOverlappingWrite(
    startPos: number,
    newMessages: NewStreamMessage[]
  ) {
    const existingIdsSlice = messages
      .slice(startPos, startPos + newMessages.length)
      .map(m => m.messageId)
    if (newMessages.length > existingIdsSlice.length) {
      throw new WrongExpectedVersionError()
    }
    for (let i = 0; i < newMessages.length; i++) {
      if (existingIdsSlice[i] !== newMessages[i].messageId) {
        throw new WrongExpectedVersionError()
      }
    }
  }

  function appendMessages(newMessages: NewStreamMessage[]) {
    for (let i = 0; i < newMessages.length; i++) {
      const newMessage = newMessages[i]
      const streamVersion = stream.streamVersion + 1
      const position = getNextHeadPosition()
      stream.streamVersion = streamVersion
      stream.position = position
      const inMemoryMessage: InMemoryStreamMessage = {
        streamId: stream.id,
        messageId: newMessage.messageId,
        streamVersion,
        position,
        createdAt: getCurrentTime(),
        type: newMessage.type,
        data: serializer.serialize(newMessage.data),
        meta: serializer.serialize(newMessage.meta || {})
      }

      messages.push(inMemoryMessage)
      messageMap.set(inMemoryMessage.messageId, inMemoryMessage)
      inMemoryAllStream.push(inMemoryMessage)
    }
    onStreamAppended()
  }

  function deleteAllMessages() {
    messages.slice().forEach(m => deleteMessage(m.messageId))
  }
}
