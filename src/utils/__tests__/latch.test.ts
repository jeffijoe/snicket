import { createDuplexLatch } from '../latch'
import { delay } from '../promise-util'

test('resolves wait() when latch reaches 0', async () => {
  const latch = createDuplexLatch()
  latch.enter()
  latch.enter()

  const p = latch.wait().then(() => expect(true).toBe(true))
  await delay(10)

  expect.assertions(0)
  latch.exit()

  await delay(10)
  expect.assertions(0)

  latch.exit()
  await p
  expect.assertions(1)
})

test('resolves wait() when 0 immediately', async () => {
  const latch = createDuplexLatch()
  await latch.wait()
  latch.enter()
  latch.enter()
  latch.exit()
  latch.exit()
  await latch.wait()
})
