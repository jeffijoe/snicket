import { generateMessages } from '../../postgres/__tests__/__helpers__/message-helper'
import { StreamMessage } from '../../types/messages'
import ms from 'ms'
import { filterExpiredMessages } from '../filter-expired'
import { toMetadataStreamId } from '../id-util'

test('filters expired messages and reports them', async () => {
  const now = new Date()
  const streamId = 'stream'
  const allMessages: Array<StreamMessage> = generateMessages(10).map<
    StreamMessage
  >((msg, i) => ({
    ...msg,
    streamId,
    createdAt: new Date(now.getTime() - (10 - i) * 60000),
    position: (i + 1).toString(),
    streamVersion: i + 1,
    meta: {}
  }))

  const tuples = allMessages.map(message => ({
    message,
    maxAge: ms('5 minutes') / 1000
  }))
  const { valid, expired } = filterExpiredMessages(tuples, () => now)

  expect(valid).toHaveLength(4)
  expect(valid[0].streamVersion).toBe(7)
  expect(expired).toHaveLength(6)
})

test('skips meta messages', async () => {
  const now = new Date()
  const streamId = toMetadataStreamId('stream')
  const allMessages: Array<StreamMessage> = generateMessages(10).map<
    StreamMessage
  >((msg, i) => ({
    ...msg,
    streamId,
    createdAt: new Date(now.getTime() - (10 - i) * 60000),
    position: (i + 1).toString(),
    streamVersion: i + 1,
    meta: {}
  }))

  const tuples = allMessages.map(message => ({
    message,
    maxAge: ms('5 minutes') / 1000
  }))
  const { valid, expired } = filterExpiredMessages(tuples, () => now)

  expect(valid).toHaveLength(10)
  expect(valid[0].streamVersion).toBe(1)
  expect(expired).toHaveLength(0)
})

test('skips messages with no max count item', async () => {
  const now = new Date()
  const streamId = 'stream'
  const allMessages: Array<StreamMessage> = generateMessages(10).map<
    StreamMessage
  >((msg, i) => ({
    ...msg,
    streamId,
    createdAt: new Date(now.getTime() - (10 - i) * 60000),
    position: (i + 1).toString(),
    streamVersion: i + 1,
    meta: {}
  }))

  const tuples = allMessages.map(message => ({
    message,
    maxAge: null
  }))
  const { valid, expired } = filterExpiredMessages(tuples, () => now)

  expect(valid).toHaveLength(10)
  expect(valid[0].streamVersion).toBe(1)
  expect(expired).toHaveLength(0)
})
