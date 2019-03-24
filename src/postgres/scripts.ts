import { replaceSchema } from './utils/query-util'
import format from 'pg-format'
import { NewStreamMessage } from '../types/messages'

export function createScripts(schema?: string) {
  return {
    append: (
      streamId: string,
      expectedVersion: number,
      newMessages: Array<NewStreamMessage>
    ) =>
      format(
        replaceSchema(
          'select current_position, current_version from __schema__.append_to_stream(%L,%L::int,%s::__schema__.new_stream_message[])',
          schema
        ),
        streamId,
        expectedVersion,
        serializeMessages(newMessages)
      ),
    setStreamMetadata: (
      streamId: string,
      metaStreamId: string,
      expectedVersion: number,
      message: NewStreamMessage
    ) =>
      format(
        replaceSchema(
          'select __schema__.set_stream_metadata(%L::text,%L::text,%L::int,%s::__schema__.new_stream_message) as current_version',
          schema
        ),
        streamId,
        metaStreamId,
        expectedVersion,
        serializeMessage(message)
      ),
    readStreamInfo: (streamId: string) =>
      format(
        replaceSchema('select * from __schema__.read_stream_info(%L)', schema),
        streamId
      ),
    readStreamMessages: (
      streamId: string,
      fromVersionInclusive: number,
      count: number,
      forward: boolean
    ) =>
      format(
        replaceSchema(
          'select * from __schema__.read_stream(%L,%L,%L,%L)',
          schema
        ),
        streamId,
        fromVersionInclusive,
        count,
        forward
      ),
    readHeadPosition: replaceSchema(
      'select __schema__.read_head_position() as pos',
      schema
    ),
    readAllMessages: (
      count: number,
      fromPositionInclusive: string,
      forward: boolean
    ) =>
      format(
        replaceSchema('select * from __schema__.read_all(%L,%L,%L)', schema),
        count,
        fromPositionInclusive,
        forward
      )
  }
}

/**
 * Serializes a bunch of messages to send to Postgres.
 *
 * @param messages
 */
function serializeMessages(messages: NewStreamMessage[]) {
  return `ARRAY[${messages.map(serializeMessage).join(',')}]`
}

/**
 * Serializes a message to be sent to Postgres.
 *
 * @param message
 */
function serializeMessage(message: NewStreamMessage) {
  return format(
    `(%L::uuid,%L,%L,%L)`,
    message.messageId,
    message.type,
    message.data,
    message.meta || {}
  )
}
