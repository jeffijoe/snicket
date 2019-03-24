import { createPollingNotifier } from '../polling-notifier'
import { delay } from '../../utils/promise-util'
import { noopLogger } from '../../logging/noop'
import { DisposedError } from '../../errors/errors'

test('notifies correctly', async () => {
  const readHeadPosition = jest
    .fn()
    .mockReturnValueOnce(Promise.resolve('1'))
    .mockReturnValueOnce(Promise.resolve('1'))
    .mockReturnValueOnce(Promise.resolve('2'))
    .mockReturnValueOnce(Promise.resolve('2'))
    .mockReturnValueOnce(Promise.resolve('2'))
    .mockReturnValue(Promise.resolve('3'))

  const notifier = createPollingNotifier(10, readHeadPosition, noopLogger)
  const cb1 = jest.fn()
  const cb2 = jest.fn()
  const dispose = notifier.listen(cb1)
  notifier.listen(cb2)

  await delay(100)
  dispose()
  readHeadPosition.mockReturnValue(Promise.resolve('4'))
  await delay(200)
  expect(cb1).toHaveBeenCalledTimes(3)
  expect(cb2).toHaveBeenCalledTimes(4)

  await notifier.dispose()
  const currentCallCount = readHeadPosition.mock.calls.length
  await delay(200)
  expect(currentCallCount).toBe(readHeadPosition.mock.calls.length)

  await expect(notifier.dispose()).rejects.toBeInstanceOf(DisposedError)
  expect(() => notifier.listen(Boolean)).toThrowError(DisposedError)
})
