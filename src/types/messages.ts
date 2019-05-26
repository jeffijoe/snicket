/**
 * Omits props from T.
 */
type Omit<T, P extends keyof T> = Pick<T, Exclude<keyof T, P>>

/**
 * Message position type.
 * String because JS does not support BigInt yet.
 */
export type MessagePosition = string

/**
 * Stream version type.
 */
export type StreamVersion = number

/**
 * Meta positions for reading.
 */
export enum Position {
  /**
   * Read from the start of the stream.
   */
  Start = 0,
  /**
   * Read from the end of the stream.
   */
  End = -1
}

/**
 * Stream message.
 */
export interface StreamMessage {
  messageId: string
  position: MessagePosition
  data: any
  type: string
  createdAt: Date
  streamId: string
  streamVersion: StreamVersion
  meta: any
}
/**
 * Like StreamMessage but trimmed down to things needed for append.
 */
export type NewStreamMessage = Omit<
  StreamMessage,
  'position' | 'createdAt' | 'streamId' | 'streamVersion' | 'meta'
> & {
  meta?: StreamMessage['meta']
}

/**
 * Message types used by store operations.
 */
export enum OperationalMessageType {
  StreamDeleted = '$stream-deleted',
  Metadata = '$stream-metadata'
}

/**
 * Streams used by store operations.
 */
export enum OperationalStream {
  Deleted = '$deleted'
}

/**
 * The payload of a `StreamDeleted` message.
 */
export interface StreamDeleted {
  /**
   * ID of the stream that was deleted.
   */
  streamId: string
}
