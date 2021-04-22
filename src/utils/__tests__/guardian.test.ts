import { throws } from 'smid'
import { DisposedError } from '../../errors/errors'
import { Actor, Guardian, GuardianController } from '../guardian'

test('guardian lifecycle', async () => {
  const testController = new TestController()
  const onRestartsExhausted = jest.fn()
  const guardian = Guardian({
    onRestartsExhausted,
    maxRestarts: 10,
    spawn: (controller) => new TestActor(controller, testController),
  })

  testController.failNextStartup()
  guardian.start()
  await nextTick()

  expect(testController.startup).toHaveBeenCalledTimes(2)
  expect(testController.shutdown).toHaveBeenCalledTimes(1)

  testController.failNextShutdown()
  await nextTick()

  expect(testController.shutdown).toHaveBeenCalledTimes(1)
  testController.reportError(new Error('lol'))
  await nextTick()
  expect(testController.shutdown).toHaveBeenCalledTimes(2)
  expect(testController.startup).toHaveBeenCalledTimes(3)

  await guardian.dispose()
  expect(testController.shutdown).toHaveBeenCalledTimes(3)
  expect(testController.startup).toHaveBeenCalledTimes(3)
})

test('restart exhaustion', async () => {
  const testController = new TestController()
  const onRestartsExhausted = jest.fn()
  const guardian = Guardian({
    onRestartsExhausted,
    maxRestarts: 10,
    spawn: (controller) => new TestActor(controller, testController),
  })

  guardian.start()
  for (let i = 0; i < 10; i++) {
    testController.reportError(new Error('oh no'))
    await nextTick()
  }

  expect(onRestartsExhausted).toHaveBeenCalledTimes(1)
  expect(testController.startup).toHaveBeenCalledTimes(10)
  expect(testController.shutdown).toHaveBeenCalledTimes(10)

  testController.reportError(new Error('again'))
  await nextTick()
  expect(onRestartsExhausted).toHaveBeenCalledTimes(1)
  expect(testController.startup).toHaveBeenCalledTimes(10)
  expect(testController.shutdown).toHaveBeenCalledTimes(10)
})

test('can reset the restart count', async () => {
  const testController = new TestController()
  const onRestartsExhausted = jest.fn()
  const guardian = Guardian({
    onRestartsExhausted,
    maxRestarts: 10,
    spawn: (controller) => new TestActor(controller, testController),
  })

  guardian.start()
  for (let i = 0; i < 5; i++) {
    testController.reportError(new Error('oh no'))
    await nextTick()
  }
  testController.guardianController.resetRestartCount()
  for (let i = 0; i < 7; i++) {
    testController.reportError(new Error('oh no'))
    await nextTick()
  }
  expect(onRestartsExhausted).toHaveBeenCalledTimes(0)
  expect(testController.startup).toHaveBeenCalledTimes(13)
  expect(testController.shutdown).toHaveBeenCalledTimes(12)
})

test('disposing before starting is a noop but twice is an error', async () => {
  const guardian = Guardian({
    spawn: () => {
      throw new Error('lol')
    },
  })

  await guardian.dispose()
  const err = await throws(guardian.dispose())
  expect(err).toBeInstanceOf(DisposedError)
})

enum TestBehavior {
  Happy,
  FailNextStartup,
  FailNextShutdown,
}

class TestController {
  behavior = TestBehavior.Happy
  guardianController: GuardianController = null!

  startup = jest.fn()
  shutdown = jest.fn()

  connect(guardianController: GuardianController) {
    this.guardianController = guardianController
  }

  reportError(err: Error) {
    this.guardianController.onError(err)
  }

  failNextStartup() {
    this.behavior = TestBehavior.FailNextStartup
    return this
  }

  failNextShutdown() {
    this.behavior = TestBehavior.FailNextShutdown
    return this
  }
}

class TestActor implements Actor {
  readonly name = 'TestActor'

  constructor(
    public controller: GuardianController,
    private testController: TestController
  ) {
    testController.connect(controller)
  }

  async startup(): Promise<void> {
    this.testController.startup()
    if (this.testController.behavior === TestBehavior.FailNextStartup) {
      this.testController.behavior = TestBehavior.Happy
      throw new Error('cant start')
    }
  }

  async shutdown(): Promise<void> {
    this.testController.shutdown()
    if (this.testController.behavior === TestBehavior.FailNextShutdown) {
      this.testController.behavior = TestBehavior.Happy
      throw new Error('cant shutdown')
    }
  }
}

function nextTick() {
  return new Promise((resolve) => process.nextTick(resolve))
}
