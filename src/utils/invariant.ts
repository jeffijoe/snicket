import { InvalidParameterError, DisposedError } from '../errors/errors'
import validateUUID from 'uuid-validate'
import {
  NewStreamMessage,
  MessagePosition,
  ReadFrom,
  StreamVersion,
} from '../types/messages'
import { ExpectedVersion, SetStreamMetadataOptions } from '..'

/**
 * Ensures the specified field is given.
 *
 * @param paramName
 * @param value
 */
export function required<T>(
  paramName: string,
  value: T | null | undefined
): T | never {
  check(
    `${paramName} is required`,
    () => value !== null && value !== undefined && (value as any) !== ''
  )
  return value!
}

/**
 * Requires the value to be a string and to be defined.
 *
 * @param paramName
 * @param value
 */
export function requiredString(paramName: string, value: any): string | never {
  check(`${paramName} is required`, () => !!value)
  check(`${paramName} must be a string`, () => typeof value === 'string')
  return value
}

/**
 * Requires the value to be a string and to be defined.
 *
 * @param paramName
 * @param value
 */
export function requiredFunc(paramName: string, value: any): string | never {
  check(`${paramName} is required`, () => !!value)
  check(`${paramName} must be a function`, () => typeof value === 'function')
  return value
}

/**
 * Throws if the stream ID is an operational stream.
 *
 * @param paramName
 * @param streamId
 */
export function notOperationalStream(paramName: string, streamId: string) {
  return assert(
    `${paramName} must not start with a "$", as they are reserved for operational streams.`,
    !streamId.startsWith('$')
  )
}

/**
 * Runs the given check fn, throws an error with the specified message if the check returns false.
 *
 * @param message
 * @param fn
 */
export function assert(message: string, condition: any): void | never {
  if (!condition) {
    throw new InvalidParameterError(message)
  }
}

/**
 * Runs the given check fn, throws an error with the specified message if the check returns false.
 *
 * @param message
 * @param fn
 */
export function check(message: string, fn: () => boolean): void | never {
  if (!fn()) {
    throw new InvalidParameterError(message)
  }
}

/**
 * Validates that the param is a UUID.
 * Does not throw if the value is falsy (should use required first).
 *
 * @param value
 */
export function uuid(
  paramName: string,
  value?: string
): string | undefined | never {
  check(`${paramName} is not a valid UUID`, () => !value || validateUUID(value))
  return value
}

/**
 * Asserts the store has not been disposed.
 *
 * @param disposed
 */
export function storeNotDisposed(disposed: boolean) {
  if (disposed) {
    throw new DisposedError('The stream store has been disposed.')
  }
}

/**
 * Validates an append request.
 *
 * @param streamId
 * @param expectedVersion
 * @param newMessages
 */
export function validateAppendRequest(
  streamId: string,
  expectedVersion: number,
  newMessages: NewStreamMessage[]
) {
  requiredString('streamId', streamId)
  notOperationalStream('streamId', streamId)
  required('expectedVersion', expectedVersion)
  required('newMessages', newMessages)
  newMessages.forEach((m, i) => {
    required(`newMessages[${i}].messageId`, m.messageId)
    uuid(`newMessages[${i}].messageId`, m.messageId)
    required(`newMessages[${i}].type`, m.type)
    required(`newMessages[${i}].data`, m.data)
  })
}

/**
 * Valodates a read stream request.
 *
 * @param streamId
 * @param fromVersionInclusive
 * @param count
 */
export function validateReadStreamRequest(
  streamId: string,
  fromVersionInclusive: number,
  count: number
) {
  requiredString('streamId', streamId)
  required('afterVersion', fromVersionInclusive)
  required('count', count)
  InvalidParameterError.assert(count > 0, `count must be greater than zero`)
}

/**
 * Validates a read all request.
 *
 * @param fromPositionInclusive
 * @param count
 */
export function validateReadAllRequest(
  fromPositionInclusive: MessagePosition | ReadFrom,
  count: number
) {
  required('fromPositionInclusive', fromPositionInclusive)
  required('count', count)
  InvalidParameterError.assert(count > 0, 'count should be greater than zero')
}

/**
 * Validates a list streams request.
 *
 * @param maxCount
 * @param cursor
 */
export function validateListStreamsRequest(
  maxCount: number,
  cursor?: string
): string {
  cursor = cursor || '0'
  assert('cursor is not a valid listStreams cursor.', /^\d*$/.test(cursor))
  assert('maxCount should be greater than zero', maxCount > 0)
  return cursor
}

/**
 * Validates a set stream metadata request.
 *
 * @param streamId
 * @param expectedVersion
 * @param opts
 */
export function validateSetStreamMetadataRequest(
  streamId: string,
  expectedVersion: StreamVersion | ExpectedVersion,
  opts: SetStreamMetadataOptions
) {
  requiredString('streamId', streamId)
  required('expectedVersion', expectedVersion)
  required('opts', opts)
}

/**
 * Validates a delete stream request.
 *
 * @param streamId
 * @param expectedVersion
 */
export function validateDeleteStreamRequest(
  streamId: string,
  expectedVersion: ExpectedVersion
) {
  requiredString('streamId', streamId)
  notOperationalStream('streamId', streamId)
  required('expectedVersion', expectedVersion)
}

/**
 * Validates a read stream metadata request.
 *
 * @param streamId
 */
export function validateReadStreamMetadataRequest(streamId: string) {
  requiredString('streamId', streamId)
}

/**
 * Validates a delete message request.
 *
 * @param streamId
 * @param messageId
 */
export function validateDeleteMessageRequest(
  streamId: string,
  messageId: string
) {
  requiredString('streamId', streamId)
  requiredString('messageId', messageId)
}
