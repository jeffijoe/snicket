import {
  StreamStore,
  ExpectedVersion,
  AppendToStreamResult
} from '../types/stream-store'
import { v4 } from 'uuid'
import v5 from 'uuid/v5'
import { InvalidParameterError, WrongExpectedVersionError } from '..'
import { createResetEvent } from '../utils/reset-event'
import _ from 'lodash'
import { throws } from 'smid'
import { generateMessages } from '../__helpers__/message-helper'

jest.setTimeout(6000000)

export function appendTestFor(
  getStore: () => Promise<StreamStore>,
  teardown?: () => Promise<unknown>
) {
  let store: StreamStore
  beforeAll(async () => {
    store = await getStore()
  })

  afterAll(() => store.dispose().then(teardown))

  describe('appending', () => {
    test('basic', async () => {
      const streamId = v4()
      let result = await store.appendToStream(
        streamId,
        ExpectedVersion.Empty,
        generateMessages(5)
      )
      expect(result.streamVersion).toBe(4)

      result = await store.appendToStream(
        streamId,
        result.streamVersion,
        generateMessages(2)
      )
      expect(result.streamVersion).toBe(6)
    })

    test('throws on bad stream name', async () => {
      await expect(
        store.appendToStream('$lol', ExpectedVersion.Any, [])
      ).rejects.toBeInstanceOf(InvalidParameterError)
    })

    test('throws wrong expected version error when creating the stream', async () => {
      const streamId = v5('Wow', v4())
      let result: AppendToStreamResult = null!
      const succeeded = createResetEvent()
      const setResult = (r: AppendToStreamResult) => {
        result = r
        succeeded.set()
      }
      await expect(
        Promise.all([
          store
            .appendToStream(
              streamId,
              ExpectedVersion.Empty,
              generateMessages(2)
            )
            .then(setResult),
          store
            .appendToStream(
              streamId,
              ExpectedVersion.Empty,
              generateMessages(2)
            )
            .then(setResult)
        ])
      ).rejects.toBeInstanceOf(WrongExpectedVersionError)
      await succeeded.wait()
      expect(result.streamVersion).toBe(1)
    })

    test('throws wrong expected version error when adding messages', async () => {
      const streamId = v4()
      let result = await store.appendToStream(
        streamId,
        ExpectedVersion.Empty,
        generateMessages(5)
      )
      expect(result.streamVersion).toBe(4)
      const succeeded = createResetEvent()
      const setResult = (r: AppendToStreamResult) => {
        result = r
        succeeded.set()
      }
      await expect(
        Promise.all([
          store
            .appendToStream(streamId, result.streamVersion, generateMessages(2))
            .then(setResult),
          store
            .appendToStream(streamId, result.streamVersion, generateMessages(2))
            .then(setResult)
        ])
      ).rejects.toBeInstanceOf(WrongExpectedVersionError)
      await succeeded.wait()
      expect(result.streamVersion).toBe(6)
    })

    test('throws wrong expected version error when adding messages many times in parallel', async () => {
      const streamId = v4()
      let result = await store.appendToStream(
        streamId,
        ExpectedVersion.Empty,
        generateMessages(5)
      )
      expect(result.streamVersion).toBe(4)

      const succeeded = createResetEvent()
      await expect(
        Promise.all(
          _.range(20).map(() =>
            store
              .appendToStream(
                streamId,
                result.streamVersion,
                generateMessages(2)
              )
              .then(r => (result = r))
              .then(succeeded.set)
          )
        )
      ).rejects.toBeInstanceOf(WrongExpectedVersionError)
      // There's a race condition which is fine in real code but causes the test to fail in like a 1/100 chance.
      // Basically, if a wrong expected version error is caught before one of the concurrently running appends succeed (and one will!),
      // we reach this point but the succeeding append hasn't updated the result yet.
      // That's why we are using this little trick with the reset event.
      await succeeded.wait()
      expect(result.streamVersion).toBe(6)
    })

    test('does not care about version when using ExpectedVersion.Any', async () => {
      const streamId = v4()
      let result = await store.appendToStream(
        streamId,
        ExpectedVersion.Any,
        generateMessages(5)
      )

      await store
        .appendToStream(streamId, ExpectedVersion.Any, generateMessages(2))
        .then(r => (result = r))
      result = await store
        .appendToStream(streamId, ExpectedVersion.Any, generateMessages(2))
        .then(r => (result = r))
      expect(result.streamVersion).toBe(8)
    })

    test('can append with ExpectedVersion.Any and same stream ID in parallel without fail', async () => {
      const streamId = v4()
      await Promise.all(
        _.range(50).map(() =>
          store.appendToStream(
            streamId,
            ExpectedVersion.Any,
            generateMessages(10)
          )
        )
      )
    })

    test('can append with ExpectedVersion.Any in parallel without fail', async () => {
      await Promise.all(
        _.range(50).map(() =>
          store.appendToStream(v4(), ExpectedVersion.Any, generateMessages(10))
        )
      )
    })

    test('can create a stream with no messages', async () => {
      const streamId = v4()
      await store.appendToStream(streamId, ExpectedVersion.Empty, [])
      await store.appendToStream(streamId, ExpectedVersion.Any, [])
    })

    test('throws an error when not passing in proper args', async () => {
      const err = await throws<InvalidParameterError>(
        store.appendToStream(false as any, ExpectedVersion.Any, [])
      )
      expect(err).toBeInstanceOf(InvalidParameterError)
      expect(err.message).toMatchInlineSnapshot(`"streamId is required"`)

      const err2 = await throws<InvalidParameterError>(
        store.appendToStream(v4(), ExpectedVersion.Any, [{} as any])
      )
      expect(err2.message).toMatchInlineSnapshot(
        `"newMessages[0].messageId is required"`
      )
    })
  })
}
