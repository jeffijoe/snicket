import {
  StreamStore,
  ListStreamsResult,
  ReadDirection,
  ReadStreamResult,
  ReadAllResult,
  StreamMetadataResult,
  ExpectedVersion,
  SetStreamMetadataOptions,
  SetStreamMetadataResult,
  AppendToStreamResult
} from '../types/stream-store'
import BigInteger from 'big-integer'
import {
  NewStreamMessage,
  StreamVersion,
  ReadFrom,
  MessagePosition,
  StreamMessage,
  OperationalStream,
  OperationalMessageType
} from '../types/messages'
import {
  InMemoryStream,
  InMemoryStreamMessage,
  createInMemoryStream
} from './in-memory-stream'
import {
  MessageProcessor,
  StreamSubscriptionOptions,
  StreamSubscription,
  AllSubscriptionOptions,
  AllSubscription
} from '..'
import * as invariant from '../utils/invariant'
import { MessageDataSerializer } from '../types/serialization'
import { jsonSerializer } from '../serialization'
import { toMetadataStreamId } from '../utils/id-util'
import { WrongExpectedVersionError, DisposedError } from '../errors/errors'
import { newDeterministicUuid, newRandomUuid } from '../infra/id'
import { createStreamDeletedPayload } from '../infra/deletion'
import { Logger } from '../types/logger'
import { noopLogger } from '../logging/noop'
import { createStreamSubscription } from '../subscriptions/stream-subscription'
import { Subscription, SubscriptionOptions } from '../types/subscriptions'
import { createInMemoryNotifier } from './in-memory-notifier'
import { createAllSubscription } from '../subscriptions/all-subscription'
import { filterExpiredMessages } from '../utils/filter-expired'

/**
 * Options for the in-memory stream store.
 */
export interface InMemoryStreamStoreOptions {
  /**
   * Serializer for message data and metadata. Defaults to a JSON-based one.
   */
  serializer?: MessageDataSerializer
  /**
   * Getter for the current time. Used internally for testing.
   *
   * @private
   */
  getCurrentTime?: () => Date
  /**
   * Logger used for logging. Duh.
   */
  logger?: Logger
}

/**
 * Creates an in-memory stream store.
 */
export function createInMemoryStreamStore(
  opts: InMemoryStreamStoreOptions = {}
): StreamStore {
  const serializer = opts.serializer || jsonSerializer
  let disposed = false
  let globalHeadPosition: BigInteger.BigInteger = BigInteger(-1)
  const streamMap = new Map<string, InMemoryStream>()
  const inMemoryAllStream: InMemoryStreamMessage[] = []
  const getCurrentTime = opts.getCurrentTime || (() => new Date())
  const logger = opts.logger || noopLogger
  const subscriptions: Subscription[] = []
  const notifier = createInMemoryNotifier()
  const store: StreamStore = {
    readHeadPosition,
    listStreams,
    readStream,
    readAll,
    readStreamMetadata,
    setStreamMetadata,
    appendToStream,
    deleteMessage,
    deleteStream,
    dispose,
    subscribeToAll,
    subscribeToStream
  }
  return store

  /**
   * Read the head position (the newest message's position).
   */
  async function readHeadPosition(): Promise<string> {
    assertNotDisposed()
    return globalHeadPosition.toString()
  }

  /**
   * Lists streams in the store. Use the cursor to page.
   *
   * @param maxCount the max amount of stream IDs to return.
   * @param cursor a cursor for the next page.
   */
  async function listStreams(
    maxCount: number,
    cursor?: string
  ): Promise<ListStreamsResult> {
    assertNotDisposed()
    cursor = invariant.validateListStreamsRequest(maxCount, cursor)
    const streamValues = Array.from(streamMap.values()).slice()
    const fromInclusive = parseInt(cursor, 10)
    const end = fromInclusive + maxCount
    const slice = streamValues.slice(fromInclusive, end)
    return {
      cursor: end.toString(),
      streamIds: slice.map(s => s.id)
    }
  }

  /**
   * Reads a stream at the specified `fromVersionInclusive` - use `0` to start at the beginning.
   * Returns a descriptor of the stream as well as the messages.
   *
   * @param streamId the stream to read
   * @param fromVersionInclusive where to start reading
   * @param count how many messages to read
   */
  async function readStream(
    streamId: string,
    fromVersionInclusive: StreamVersion | ReadFrom,
    count: number,
    direction?: ReadDirection
  ): Promise<ReadStreamResult> {
    assertNotDisposed()
    invariant.validateReadStreamRequest(streamId, fromVersionInclusive, count)
    return readStreamInternal(streamId, fromVersionInclusive, count, direction)
  }

  /**
   * Actual read stream implementation with assertions skipped.
   */
  async function readStreamInternal(
    streamId: string,
    fromVersionInclusive: StreamVersion | ReadFrom,
    count: number,
    direction?: ReadDirection
  ): Promise<ReadStreamResult> {
    const stream = streamMap.get(streamId)
    if (!stream) {
      return {
        isEnd: true,
        messages: [],
        nextVersion: direction === ReadDirection.Backward ? -1 : 0,
        streamPosition: '-1',
        streamId,
        streamVersion: -1
      }
    }

    const startIndex =
      fromVersionInclusive === ReadFrom.Start
        ? 0
        : fromVersionInclusive === ReadFrom.End
        ? stream.messages.length - 1
        : stream.messages.findIndex(
            m => m.streamVersion >= fromVersionInclusive
          )

    if (startIndex === -1) {
      return {
        streamId: stream.id,
        isEnd: true,
        streamVersion: stream.streamVersion,
        messages: [],
        nextVersion:
          direction === ReadDirection.Backward ? -1 : stream.streamVersion + 1,
        streamPosition: stream.position.toString()
      }
    }
    const readResult =
      direction === ReadDirection.Backward
        ? readStreamBackward(stream, startIndex, count)
        : readStreamForward(stream, startIndex, count)
    const meta = await readStreamMetadataInternal(streamId)
    return {
      ...readResult,
      messages: filterExpiredMessages(
        readResult.messages.map(m => ({ maxAge: meta.maxAge, message: m })),
        getCurrentTime
      ).valid
    }
  }

  /**
   * Reads the stream forwards.
   *
   * @param stream
   * @param startIndex
   * @param count
   */
  function readStreamForward(
    stream: InMemoryStream,
    startIndex: number,
    count: number
  ): ReadStreamResult {
    const slice = stream.messages.slice(startIndex, startIndex + count + 1)
    const isEnd = slice.length < count + 1
    if (!isEnd) {
      slice.splice(slice.length - 1, 1)
    }

    const lastMessage = slice.length > 0 ? slice[slice.length - 1] : null
    return {
      isEnd,
      streamId: stream.id,
      streamPosition: stream.position.toString(),
      streamVersion: stream.streamVersion,
      messages: slice.map(m => toStreamMessage(m)),
      nextVersion:
        (lastMessage
          ? isEnd
            ? stream.streamVersion
            : lastMessage.streamVersion
          : stream.streamVersion) + 1
    }
  }

  /**
   * Reads the stream backwards.
   *
   * @param stream
   * @param startIndex
   * @param count
   */
  function readStreamBackward(
    stream: InMemoryStream,
    startIndex: number,
    count: number
  ): ReadStreamResult {
    const slice = stream.messages.slice(
      Math.max(0, startIndex - count),
      startIndex + 1
    )

    const isEnd = slice.length < count + 1
    if (!isEnd) {
      slice.splice(0, 1)
    }
    const lastMessage = slice.length > 0 ? slice[0] : null
    slice.reverse()
    return {
      isEnd,
      streamId: stream.id,
      streamPosition: stream.position.toString(),
      streamVersion: stream.streamVersion,
      messages: slice.map(m => toStreamMessage(m)),
      nextVersion: Math.max(-1, isEnd ? -1 : lastMessage!.streamVersion - 1)
    }
  }

  /**
   * Reads all messages from all streams.
   *
   * @param fromPositionInclusive
   * @param count
   * @param direction
   */
  async function readAll(
    fromPositionInclusive: MessagePosition | ReadFrom,
    count: number,
    direction?: ReadDirection
  ): Promise<ReadAllResult> {
    assertNotDisposed()
    invariant.validateReadAllRequest(fromPositionInclusive, count)
    const fromPos = BigInteger(fromPositionInclusive.toString())
    const startIndex = fromPos.eq(ReadFrom.Start)
      ? 0
      : fromPos.eq(ReadFrom.End)
      ? inMemoryAllStream.length - 1
      : inMemoryAllStream.findIndex(m => m.position.greaterOrEquals(fromPos))

    if (startIndex === -1) {
      return {
        isEnd: true,
        messages: [],
        nextPosition:
          direction === ReadDirection.Backward
            ? '-1'
            : globalHeadPosition.plus(1).toString()
      }
    }

    const result =
      direction === ReadDirection.Backward
        ? readAllBackward(startIndex, count)
        : readAllForward(startIndex, count)
    return {
      ...result,
      messages: await maybeFilterExpiredMessages(result.messages)
    }
  }

  /**
   * Reads the all-stream forward.
   *
   * @param startIndex
   * @param count
   */
  function readAllForward(startIndex: number, count: number): ReadAllResult {
    const slice = inMemoryAllStream.slice(startIndex, startIndex + count + 1)
    const isEnd = slice.length < count + 1
    if (!isEnd) {
      slice.splice(slice.length - 1, 1)
    }

    const lastMessage =
      (slice.length > 0
        ? slice[slice.length - 1]
        : inMemoryAllStream[inMemoryAllStream.length]) || null

    return {
      isEnd,
      messages: slice.map(m => toStreamMessage(m)),
      nextPosition: (lastMessage ? lastMessage.position : globalHeadPosition)
        .plus(1)
        .toString()
    }
  }

  /**
   * Reads the all-stream backward.
   *
   * @param startIndex
   * @param count
   */
  function readAllBackward(startIndex: number, count: number): ReadAllResult {
    const slice = inMemoryAllStream.slice(
      Math.max(0, startIndex - count),
      startIndex + 1
    )

    const isEnd = slice.length < count + 1
    if (!isEnd) {
      slice.splice(0, 1)
    }
    const lastMessage = slice.length > 0 ? slice[0] : null
    slice.reverse()
    return {
      isEnd,
      messages: slice.map(m => toStreamMessage(m)),
      nextPosition: BigInteger.max(
        BigInteger(-1),
        isEnd
          ? BigInteger(-1)
          : BigInteger(lastMessage!.position).minus(BigInteger(1))
      ).toString()
    }
  }

  /**
   * Gets the stream's metadata.
   * @param streamId
   */
  async function readStreamMetadata(
    streamId: string
  ): Promise<StreamMetadataResult> {
    assertNotDisposed()
    invariant.validateReadStreamMetadataRequest(streamId)
    return readStreamMetadataInternal(streamId)
  }

  /**
   * Internal read stream metadata without the assertions.
   *
   * @param streamId
   */
  async function readStreamMetadataInternal(
    streamId: string
  ): Promise<StreamMetadataResult> {
    const read = await readStreamInternal(
      toMetadataStreamId(streamId),
      ReadFrom.End,
      1,
      ReadDirection.Backward
    )
    if (read.messages.length === 0) {
      return {
        maxAge: null,
        maxCount: null,
        metadata: null,
        truncateBefore: null,
        metadataStreamVersion: -1,
        streamId: streamId
      }
    }

    const message = read.messages[0]
    return {
      maxAge: message.data.maxAge || null,
      maxCount: message.data.maxCount || null,
      metadata: message.data.metadata,
      metadataStreamVersion: read.streamVersion,
      truncateBefore: message.data.truncateBefore || null,
      streamId
    }
  }

  /**
   * Sets the stream's metadata.
   * @param streamId
   */
  async function setStreamMetadata(
    streamId: string,
    expectedVersion: StreamVersion | ExpectedVersion,
    opts: SetStreamMetadataOptions
  ): Promise<SetStreamMetadataResult> {
    invariant.validateSetStreamMetadataRequest(streamId, expectedVersion, opts)
    const metaStreamId = toMetadataStreamId(streamId)
    const data = {
      metadata: opts.metadata || {},
      maxAge: opts.maxAge || null,
      maxCount: opts.maxCount || null,
      truncateBefore:
        typeof opts.truncateBefore === 'number' ? opts.truncateBefore : null
    }
    const metaMsgId = newRandomUuid()
    const result = await appendToStreamInternal(metaStreamId, expectedVersion, [
      NewStreamMessage.of(metaMsgId, OperationalMessageType.Metadata, data)
    ])

    await scavengeStreamInternal(
      streamId,
      data.maxAge,
      data.maxCount,
      data.truncateBefore
    )
    return {
      currentVersion: result.streamVersion
    }
  }

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
  async function appendToStream(
    streamId: string,
    expectedVersion: StreamVersion | ExpectedVersion,
    newMessages: NewStreamMessage[]
  ): Promise<AppendToStreamResult> {
    assertNotDisposed()
    invariant.validateAppendRequest(streamId, expectedVersion, newMessages)
    const result = await appendToStreamInternal(
      streamId,
      expectedVersion,
      newMessages
    )
    const meta = await readStreamMetadataInternal(streamId)
    await scavengeStreamInternal(
      streamId,
      meta.maxAge,
      meta.maxCount,
      meta.truncateBefore
    )
    return result
  }

  /**
   * Append without the message validation.
   */
  async function appendToStreamInternal(
    streamId: string,
    expectedVersion: number,
    newMessages: NewStreamMessage[]
  ): Promise<AppendToStreamResult> {
    let stream = streamMap.get(streamId)
    if (!stream) {
      stream = createInMemoryStream(
        streamId,
        serializer,
        inMemoryAllStream,
        onStreamAppended,
        getNextHeadPosition,
        getCurrentTime
      )
      streamMap.set(streamId, stream)
    }
    stream.appendToStream(expectedVersion, newMessages)
    return {
      streamPosition: stream.position.toString(),
      streamVersion: stream.streamVersion
    }
  }

  /**
   * Subscribes to a stream.
   * If no `subscriptionOptions.afterVersion` is specified,
   * starts subscribing at the head of the stream.
   *
   * @param streamId
   * @param processMessage
   * @param subscriptionOptions
   */
  async function subscribeToStream(
    streamId: string,
    processMessage: MessageProcessor,
    subscriptionOptions?: StreamSubscriptionOptions
  ): Promise<StreamSubscription> {
    assertNotDisposed()
    return new Promise<StreamSubscription>(resolve => {
      const subscription = createStreamSubscription(
        streamId,
        store,
        notifier,
        logger,
        processMessage,
        {
          ...subscriptionOptions,
          onEstablished: () => {
            resolve(subscription)
          },
          dispose: async () => {
            await callSubscriptionOptionsDisposer(subscriptionOptions)
            subscriptions.splice(subscriptions.indexOf(subscription), 1)
            resolve(subscription)
          }
        }
      )
      subscriptions.push(subscription)
    })
  }

  /**
   * Subscribe to the all-stream.
   * If no `subscriptionOptions.afterPosition` is specified,
   * starts subscribing at the head of the all-stream.
   *
   * @param processMessage
   * @param subscriptionOptions
   */
  function subscribeToAll(
    processMessage: MessageProcessor,
    subscriptionOptions?: AllSubscriptionOptions
  ): Promise<AllSubscription> {
    assertNotDisposed()
    return new Promise<AllSubscription>(resolve => {
      const subscription = createAllSubscription(
        store,
        notifier,
        logger,
        processMessage,
        {
          ...subscriptionOptions,
          onEstablished: () => {
            resolve(subscription)
          },
          dispose: async () => {
            await callSubscriptionOptionsDisposer(subscriptionOptions)
            subscriptions.splice(subscriptions.indexOf(subscription), 1)
            resolve(subscription)
          }
        }
      )
      subscriptions.push(subscription)
    })
  }

  /**
   * Deletes a stream and all of it's messages.
   */
  async function deleteStream(
    streamId: string,
    expectedVersion: ExpectedVersion
  ): Promise<void> {
    assertNotDisposed()
    invariant.validateDeleteStreamRequest(streamId, expectedVersion)
    const stream = streamMap.get(streamId)
    if (!stream) {
      return
    }
    if (
      expectedVersion !== ExpectedVersion.Any &&
      expectedVersion !== stream.streamVersion
    ) {
      throw new WrongExpectedVersionError()
    }
    stream.deleteAllMessages()
    await appendToStreamInternal(
      OperationalStream.Deleted,
      ExpectedVersion.Any,
      [
        NewStreamMessage.of(
          newDeterministicUuid(`${streamId}.deleted.${expectedVersion}`),
          OperationalMessageType.StreamDeleted,
          createStreamDeletedPayload(streamId)
        )
      ]
    )
  }

  /**
   * Deletes a message from a stream.
   * You better have a good reason for using this.
   */
  async function deleteMessage(
    streamId: string,
    messageId: string
  ): Promise<void> {
    assertNotDisposed()
    invariant.validateDeleteMessageRequest(streamId, messageId)
    const stream = streamMap.get(streamId)
    if (!stream) {
      return
    }

    stream.deleteMessage(messageId)
  }

  /**
   * Disposes of the underlying store connection.
   * Returns a `Promise` when done.
   */
  async function dispose(): Promise<void> {
    if (disposed) {
      throw new DisposedError('The stream store has already been disposed.')
    }
    disposed = true
    await Promise.all(subscriptions.map(s => s.dispose()))
    await notifier.dispose()
    streamMap.clear()
  }

  /**
   * Filters and purges expired messages if enabled.
   *
   * @param messages
   */
  async function maybeFilterExpiredMessages(
    messages: Array<StreamMessage>
  ): Promise<Array<StreamMessage>> {
    const messageTuples = await Promise.all(
      messages.map(async message => {
        return {
          message,
          maxAge: await readStreamMetadataInternal(message.streamId).then(
            m => m.maxAge
          )
        }
      })
    )
    const { valid, expired } = filterExpiredMessages(
      messageTuples,
      getCurrentTime
    )
    expired.forEach(m => deleteMessage(m.streamId, m.messageId))
    return valid
  }

  /**
   * Notifies subscriptions.
   */
  function onStreamAppended() {
    notifier.invoke()
  }

  /**
   * Scavenges the stream.
   */
  async function scavengeStreamInternal(
    streamId: string,
    maxAge: number | null,
    maxCount: number | null,
    truncateBefore: number | null
  ): Promise<void> {
    const stream = streamMap.get(streamId)
    if (!stream) {
      return
    }

    const messages = stream.messages.slice()
    const now = getCurrentTime()
    truncateBefore = truncateBefore || 0
    const len = messages.length
    // The index at which everything lower than is considered scavengable.
    const maxCountIndex = maxCount !== null ? len - maxCount : 0
    for (let i = len - 1; i >= 0; i--) {
      const message = messages[i]
      // Since we are iterating backwards, we can detect once we walk
      // past the first `maxCount` messages, after which we can delete
      // them.
      if (i < maxCountIndex) {
        await deleteMessage(message.streamId, message.messageId)
        continue
      }

      const withMaxAgeApplied = maxAge
        ? new Date(message.createdAt.getTime() + maxAge * 1000)
        : null
      if (withMaxAgeApplied !== null && withMaxAgeApplied <= now) {
        await deleteMessage(message.streamId, message.messageId)
      }

      if (message.streamVersion < truncateBefore) {
        await deleteMessage(message.streamId, message.messageId)
      }
    }
  }

  /**
   * Gets the next global head position.
   */
  function getNextHeadPosition() {
    globalHeadPosition = globalHeadPosition.plus(1)
    return globalHeadPosition
  }

  /**
   * Maps an in-memory stream message to a real stream message.
   *
   * @param inMemoryStreamMessage
   */
  function toStreamMessage(
    inMemoryStreamMessage: InMemoryStreamMessage
  ): StreamMessage {
    return {
      messageId: inMemoryStreamMessage.messageId,
      streamId: inMemoryStreamMessage.streamId,
      position: inMemoryStreamMessage.position.toString(),
      streamVersion: inMemoryStreamMessage.streamVersion,
      type: inMemoryStreamMessage.type,
      createdAt: inMemoryStreamMessage.createdAt,
      data: serializer.deserialize(inMemoryStreamMessage.data),
      meta: serializer.deserialize(inMemoryStreamMessage.meta)
    }
  }

  /**
   * Calls the subscription disposer if one has been specified.
   *
   * @param opts
   * @param subscription
   */
  async function callSubscriptionOptionsDisposer(opts?: SubscriptionOptions) {
    return opts && opts.dispose && opts.dispose()
  }

  /**
   * Asserts that the stream store has not been disposed.
   */
  function assertNotDisposed() {
    invariant.storeNotDisposed(disposed)
  }
}
