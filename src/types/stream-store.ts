import {
  StreamVersion,
  NewStreamMessage,
  MessagePosition,
  StreamMessage,
  Position
} from './messages'
import {
  MessageProcessor,
  StreamSubscriptionOptions,
  StreamSubscription,
  AllSubscriptionOptions,
  AllSubscription
} from './subscriptions'

/**
 * Stream Store interface.
 */
export interface StreamStore {
  /**
   * Read the head position (the newest message's position).
   */
  readHeadPosition(): Promise<string>

  /**
   * Lists streams in the store. Use the cursor to page.
   *
   * @param maxCount the max amount of stream IDs to return.
   * @param cursor a cursor for the next page.
   */
  listStreams(maxCount: number, cursor?: string): Promise<ListStreamsResult>

  /**
   * Reads a stream at the specified `fromVersionInclusive` - use `0` to start at the beginning.
   * Returns a descriptor of the stream as well as the messages.
   *
   * @param streamId the stream to read
   * @param fromVersionInclusive where to start reading
   * @param count how many messages to read
   */
  readStream(
    streamId: string,
    fromVersionInclusive: StreamVersion | Position,
    count: number,
    direction?: ReadDirection
  ): Promise<ReadStreamResult>

  /**
   * Reads all messages from all streams.
   *
   * @param fromPositionInclusive
   * @param count
   * @param direction
   */
  readAll(
    fromPositionInclusive: MessagePosition | Position,
    count: number,
    direction?: ReadDirection
  ): Promise<ReadAllResult>

  /**
   * Gets the stream's metadata.
   * @param streamId
   */
  readStreamMetadata(streamId: string): Promise<StreamMetadataResult>

  /**
   * Sets the stream's metadata.
   * @param streamId
   */
  setStreamMetadata(
    streamId: string,
    expectedVersion: StreamVersion | ExpectedVersion,
    payload: SetStreamMetadataOptions
  ): Promise<SetStreamMetadataResult>

  /**
   * Appends messages to a stream. Creates it if it does not already exist.
   *
   * @param streamId
   * @param expectedVersion
   * @param newMessages
   * @throws {DuplicateMessageError}
   * @throws {WrongExpectedVersionError}
   * @throws {InconsistentStreamError}
   */
  appendToStream(
    streamId: string,
    expectedVersion: StreamVersion | ExpectedVersion,
    newMessages: NewStreamMessage[]
  ): Promise<AppendToStreamResult>

  /**
   * Subscribes to a stream.
   * If no `subscriptionOptions.afterVersion` is specified,
   * starts subscribing at the head of the stream.
   *
   * @param streamId
   * @param processMessage
   * @param subscriptionOptions
   */
  subscribeToStream(
    streamId: string,
    processMessage: MessageProcessor,
    subscriptionOptions?: StreamSubscriptionOptions
  ): Promise<StreamSubscription>

  /**
   * Subscribe to the all-stream.
   * If no `subscriptionOptions.afterPosition` is specified,
   * starts subscribing at the head of the all-stream.
   *
   * @param processMessage
   * @param subscriptionOptions
   */
  subscribeToAll(
    processMessage: MessageProcessor,
    subscriptionOptions?: AllSubscriptionOptions
  ): Promise<AllSubscription>

  /**
   * Deletes a stream and all of it's messages.
   */
  deleteStream(
    streamId: string,
    expectedVersion: ExpectedVersion
  ): Promise<void>

  /**
   * Deletes a message from a stream.
   * You better have a good reason for using this.
   */
  deleteMessage(streamId: string, messageId: string): Promise<void>

  /**
   * Disposes of the underlying store connection.
   * Returns a `Promise` when done.
   */
  dispose(): Promise<void>
}

/**
 * The result from calling `listStreams`.
 */
export interface ListStreamsResult {
  streamIds: string[]
  cursor: string
}

/**
 * The result from calling `readStream`.
 */
export interface ReadStreamResult {
  streamId: string
  streamVersion: StreamVersion
  streamPosition: MessagePosition
  nextVersion: StreamVersion
  isEnd: boolean
  messages: StreamMessage[]
}

/**
 * The result from calling `readAll`.
 */
export interface ReadAllResult {
  isEnd: boolean
  nextPosition: MessagePosition
  messages: StreamMessage[]
}

/**
 * The result from an `apppendToStream` call.
 */
export interface AppendToStreamResult {
  streamVersion: StreamVersion
  streamPosition: MessagePosition
}

/**
 * Stream metadata result.
 */
export interface StreamMetadataResult {
  /**
   * Stream ID that the metadata belongs to.
   */
  streamId: string
  /**
   * Metadata stream version. Used for concurrency control.
   */
  metadataStreamVersion: StreamVersion
  /**
   * The max age of messages allowed in the stream, in seconds.
   */
  maxAge: number | null
  /**
   * The max count of messages allowed in the stream.
   */
  maxCount: number | null
  /**
   * The version at which everything prior is discarded.
   */
  truncateBefore: number | null
  /**
   * Custom metadata.
   */
  metadata: any | null
}

/**
 * Options for setting stream metadata.
 * IMPORTANT: Omitting any fields is the same as explicitly removing it
 * from the metadata. If you intend on "patching", then you should read
 * the metadata first.
 */
export interface SetStreamMetadataOptions {
  /**
   * The amount of time (in seconds) that messages in the stream are valid for.
   * Messages older than this won't be returned, and become eligible for scavenging.
   *
   * `0` (or `undefined`) is the same as `null` (disabled)
   */
  maxAge?: number | null
  /**
   * The max amount of messages allowed in the stream.
   * When appending to a stream with `maxCount` set, it will purge extraneous messages.
   *
   * `0` (or `undefined`) is the same as `null` (disabled)
   */
  maxCount?: number | null
  /**
   * Messages with a version less than (but not including) this will become eligible for scavenging.
   *
   * `null` (or `undefined`) means disabled.
   */
  truncateBefore?: number | null
  /**
   * The stream custom metadata to set.
   */
  metadata?: any
}

/**
 * Set stream metadata result.
 */
export interface SetStreamMetadataResult {
  /**
   * Current version of the metadata stream at the time the metadata was written.
   */
  currentVersion: StreamVersion
}

/**
 * Special enumerations for passing expectedVersion.
 */
export enum ExpectedVersion {
  Any = -2,
  Empty = -1
}

/**
 * The direction of the read operation.
 */
export enum ReadDirection {
  /**
   * Read forwards from the oldest to newest.
   */
  Forward,
  /**
   * Read backwards from newest to oldest.
   */
  Backward
}
