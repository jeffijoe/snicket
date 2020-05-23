import { createResetEvent } from '../reset-event'
import { delay } from '../promise-util'

test('waits', async () => {
  const e = createResetEvent()
  const called = jest.fn()
  const p1 = e.wait().then(called)
  const p2 = e.wait().then(called)
  await delay(10)
  expect(called).not.toHaveBeenCalled()
  e.set()
  await Promise.all([p1, p2, e.wait().then(called)])
  expect(called).toHaveBeenCalledTimes(3)
  e.reset()
  const p3 = e.wait().then(called)
  await delay(10)
  expect(called).toHaveBeenCalledTimes(3)
  e.set()
  await p3
  expect(called).toHaveBeenCalledTimes(4)
})
