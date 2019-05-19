import { createStreamSubscription } from '../stream-subscription'
import { v4 } from 'uuid'
import _ from 'lodash'
import { SubscribeAt } from '../../types/subscriptions'
import { StreamStore, ReadStreamResult } from '../../types/stream-store'
import { createPollingNotifier } from '../polling-notifier'
import { delay } from '../../utils/promise-util'
import { StreamMessage } from '../../types/messages'
import { noopLogger } from '../../logging/noop'

const streamId = v4()
const messages: StreamMessage[] = _.range(1, 11).map<StreamMessage>(i => ({
  messageId: v4(),
  data: { i },
  causationId: v4(),
  correlationId: v4(),
  dateCreated: new Date(),
  position: i.toString(),
  meta: {},
  streamId: streamId,
  streamVersion: i - 1,
  streamType: 'test',
  type: 'test'
}))

let disposer: jest.Mock
let subscriptionDropped: jest.Mock
let readHeadPositionMock: jest.Mock
let readStreamMock: jest.Mock
let store: StreamStore

beforeEach(() => {
  disposer = jest.fn()
  subscriptionDropped = jest.fn()
  readHeadPositionMock = jest.fn()
  readStreamMock = jest.fn()
  store = {
    appendToStream: null as any,
    dispose: null as any,
    subscribeToStream: null as any,
    readHeadPosition: readHeadPositionMock as any,
    readStream: readStreamMock as any,
    readAll: null as any,
    getStreamMetadata: null as any,
    setStreamMetadata: null as any,
    subscribeToAll: null as any
  }
  readHeadPositionMock.mockReturnValue(_.last(messages)!.position.toString())
  readStreamMock
    .mockReturnValueOnce({
      streamId,
      isEnd: false,
      messages: messages.slice(0, 5),
      nextVersion: 5,
      streamPosition: '10',
      streamType: 'test',
      streamVersion: 9,
      maxAge: null,
      maxCount: null
    } as ReadStreamResult)
    .mockReturnValueOnce({
      streamId,
      isEnd: true,
      messages: messages.slice(5),
      nextVersion: 9,
      streamPosition: '10',
      streamType: 'test',
      streamVersion: 9,
      maxAge: null,
      maxCount: null
    } as ReadStreamResult)
    .mockReturnValue({
      streamId,
      isEnd: true,
      messages: [],
      nextVersion: 9,
      streamPosition: '10',
      streamType: 'test',
      streamVersion: 9,
      maxAge: null,
      maxCount: null
    } as ReadStreamResult)
})

test('basic', async () => {
  const processMessageMock = jest.fn()
  const notifier = createPollingNotifier(10, readHeadPositionMock, noopLogger)
  const established = jest.fn()
  const subscription = createStreamSubscription(
    streamId,
    store,
    notifier,
    noopLogger,
    processMessageMock,
    {
      onEstablished: established,
      afterVersion: SubscribeAt.Beginning,
      dispose: disposer,
      maxCountPerRead: 5,
      onSubscriptionDropped: subscriptionDropped
    }
  )

  await delay(1200)
  expect(processMessageMock).toHaveBeenCalledTimes(10)
  await subscription.dispose()
  await notifier.dispose()

  expect(disposer).toHaveBeenCalledTimes(1)
  expect(established).toHaveBeenCalledTimes(1)
  expect(subscriptionDropped).not.toHaveBeenCalled()
})
