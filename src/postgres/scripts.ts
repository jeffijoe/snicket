import { replaceSchema } from './utils/query-util'
import format from 'pg-format'
import { NewStreamMessage } from '../types/messages'

export function createScripts(schema?: string) {
  return {
    append: (
      streamId: string,
      metaStreamId: string,
      expectedVersion: number,
      createdAt: Date | null,
      newMessages: Array<NewStreamMessage>
    ) =>
      format(
        replaceSchema(
          'select current_position, current_version, max_age, max_count from __schema__.append_to_stream(%L,%L::int,%L,%L::timestamp with time zone,%s::__schema__.new_stream_message[])',
          schema
        ),
        streamId,
        expectedVersion,
        metaStreamId,
        serializeDate(createdAt),
        serializeMessages(newMessages)
      ),
    setStreamMetadata: (
      streamId: string,
      metaStreamId: string,
      expectedVersion: number,
      maxAge: number | null,
      maxCount: number | null,
      createdAt: Date | null,
      message: NewStreamMessage
    ) =>
      format(
        replaceSchema(
          'select __schema__.set_stream_metadata(%L::text,%L::text,%L::int,%L::int,%L::int,%L::timestamp with time zone,%s::__schema__.new_stream_message) as current_version',
          schema
        ),
        streamId,
        metaStreamId,
        expectedVersion,
        maxAge || 0,
        maxCount || 0,
        serializeDate(createdAt),
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
      ),
    deleteMessages: (streamId: string, messageIds: Array<string>) =>
      format(
        replaceSchema(
          'select * from __schema__.delete_messages(%L, ARRAY[%L]::uuid[])',
          schema
        ),
        streamId,
        messageIds
      ),
    deleteStream: (
      streamId: string,
      deletedStreamId: string,
      expectedVersion: number,
      createdAt: Date | null,
      deletedStreamMessage: NewStreamMessage
    ) =>
      format(
        replaceSchema(
          'select * from __schema__.delete_stream(%L,%L,%L,%L::timestamp with time zone, %s::__schema__.new_stream_message)',
          schema
        ),
        streamId,
        expectedVersion,
        deletedStreamId,
        serializeDate(createdAt),
        serializeMessage(deletedStreamMessage)
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

/**
 * Serializes a date
 */
function serializeDate(date: Date | null) {
  return date ? date.toISOString() : null
}
