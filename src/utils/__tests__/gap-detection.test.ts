import { detectGapsAndReloadAll } from '../gap-detection'
import _ from 'lodash'
import { noopLogger } from '../../logging/noop'
import { ReadAllResult } from '../../types/stream-store'
import { StreamMessage } from '../../types/messages'

test('detects gaps between messages', async () => {
  const logger = {
    ...noopLogger,
    trace: jest.fn()
  }
  const messagesWithGap = {
    isEnd: true,
    nextPosition: '20',
    messages: _.range(10, 19).map(
      i =>
        ({
          // Add a message gap
          position: i > 15 ? (i + 1).toString() : i.toString()
        } as Partial<StreamMessage>)
    ) as any
  } as ReadAllResult
  const readAll = jest
    .fn()
    .mockResolvedValueOnce(messagesWithGap)
    .mockResolvedValueOnce(messagesWithGap)
    .mockResolvedValueOnce({
      isEnd: true,
      nextPosition: '20',
      messages: _.range(10, 20).map(
        i =>
          ({
            // Add a message gap
            position: i.toString()
          } as Partial<StreamMessage>)
      ) as any
    } as ReadAllResult)

  const result = await detectGapsAndReloadAll(logger, 10, 2, '10', 10, readAll)
  expect(readAll).toHaveBeenCalledTimes(3)

  // The message that was initially skipped should be in the result
  expect(result.messages.some(x => x.position === '16')).toBe(true)
  expect(logger.trace).toHaveBeenCalledTimes(2)
  expect(logger.trace).toHaveBeenCalledWith(
    expect.stringContaining('attempt 1 / 2')
  )
  expect(logger.trace).toHaveBeenCalledWith(
    expect.stringContaining('attempt 2 / 2')
  )
})

test('detects gaps between pages', async () => {
  const logger = {
    ...noopLogger,
    trace: jest.fn()
  }
  const pageWithGap = {
    isEnd: true,
    nextPosition: '20',
    messages: _.range(11, 20).map(
      i =>
        ({
          position: i.toString()
        } as Partial<StreamMessage>)
    ) as any
  } as ReadAllResult
  const readAll = jest
    .fn()
    .mockResolvedValueOnce(pageWithGap)
    .mockResolvedValueOnce(pageWithGap)
    .mockResolvedValueOnce({
      isEnd: true,
      nextPosition: '20',
      messages: _.range(10, 20).map(
        i =>
          ({
            // Add a message gap
            position: i.toString()
          } as Partial<StreamMessage>)
      ) as any
    } as ReadAllResult)

  const result = await detectGapsAndReloadAll(logger, 10, 2, '10', 10, readAll)
  expect(readAll).toHaveBeenCalledTimes(3)

  // The message that was initially skipped should be in the result
  expect(result.messages.some(x => x.position === '16')).toBe(true)

  expect(logger.trace).toHaveBeenCalledWith(
    expect.stringContaining('attempt 1 / 2')
  )
  expect(logger.trace).toHaveBeenCalledWith(
    expect.stringContaining('attempt 2 / 2')
  )
})

test('does nothing if we only have 1 message', async () => {
  const logger = {
    ...noopLogger,
    trace: jest.fn()
  }
  const readAll = jest.fn().mockResolvedValueOnce({
    isEnd: true,
    nextPosition: '11',
    messages: [
      {
        position: '10'
      }
    ]
  } as ReadAllResult)

  await detectGapsAndReloadAll(logger, 10, 1, '10', 10, readAll)
  expect(readAll).toHaveBeenCalledTimes(1)
})
