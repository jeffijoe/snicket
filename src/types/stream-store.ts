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
   * Read the head position (the newest message's position).
   */
  readHeadPosition(): Promise<string>

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
  getStreamMetadata(streamId: string): Promise<StreamMetadataResult>

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
   * @throws {ConcurrencyError}
   * @throws {InconsistentStreamError}
   */
  appendToStream(
    streamId: string,
    expectedVersion: StreamVersion | ExpectedVersion,
    newMessages: NewStreamMessage[]
  ): Promise<AppendToStreamResult>

  /**
   * Subscribes to a stream.
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
   *
   * @param processMessage
   * @param subscriptionOptions
   */
  subscribeToAll(
    processMessage: MessageProcessor,
    subscriptionOptions?: AllSubscriptionOptions
  ): Promise<AllSubscription>

  /**
   * Disposes of the underlying store connection.
   * Returns a `Promise` when done.
   */
  dispose(): Promise<void>
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
   * Custom metadata.
   */
  metadata: any | null
}

/**
 * Options for setting stream metadata.
 */
export interface SetStreamMetadataOptions {
  /**
   * The stream custom metadata to set.
   */
  metadata: any
}

/**
 * Set stream metadata result.
 */
export interface SetStreamMetadataResult {
  /**
   * Current version of the stream at the time the metadata was written.
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
