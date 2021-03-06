import { replaceSchema } from './utils/query-util'
import format from 'pg-format'
import { NewStreamMessage } from '../types/messages'
import { MessageDataSerializer } from '../types/serialization'

export function createScripts(
  schema: string | undefined,
  serializer: MessageDataSerializer
) {
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
        serializeMessages(newMessages, serializer)
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
        serializeMessage(message, serializer)
      ),
    listStreams: (maxCount: number, afterInternalId: string) =>
      format(
        replaceSchema(
          `select * from __schema__.list_streams(%L, %L::bigint)`,
          schema
        ),
        maxCount,
        afterInternalId
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
        serializeMessage(deletedStreamMessage, serializer)
      ),
    getScavengableStreamMessageIds: (
      streamId: string,
      maxAge: number | null,
      maxCount: number | null,
      truncateBefore: number | null,
      currentTime: Date | null
    ) =>
      format(
        replaceSchema(
          'select * from __schema__.get_scavengable_stream_messages(%L, %L, %L, %L, %L::timestamp with time zone)',
          schema
        ),
        streamId,
        maxAge,
        maxCount,
        truncateBefore,
        serializeDate(currentTime)
      ),
  }
}

/**
 * Serializes a bunch of messages to send to Postgres.
 *
 * @param messages
 */
function serializeMessages(
  messages: NewStreamMessage[],
  serializer: MessageDataSerializer
) {
  return `ARRAY[${messages
    .map((m) => serializeMessage(m, serializer))
    .join(',')}]`
}

/**
 * Serializes a message to be sent to Postgres.
 *
 * @param message
 */
function serializeMessage(
  message: NewStreamMessage,
  serializer: MessageDataSerializer
) {
  return format(
    `(%L::uuid,%L,%L,%L)`,
    message.messageId,
    message.type,
    serializer.serialize(message.data),
    serializer.serialize(message.meta || {})
  )
}

/**
 * Serializes a date
 */
function serializeDate(date: Date | null) {
  return date ? date.toISOString() : null
}
