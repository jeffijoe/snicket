import { throws } from 'smid'
import { StreamStore, ExpectedVersion } from '..'
import { v4 } from 'uuid'
import { generateMessages } from '../__helpers__/message-helper'
import { WrongExpectedVersionError } from '../errors/errors'
import { ReadFrom } from '../types/messages'

export function idempotencyTestsFor(
  getStore: () => Promise<StreamStore>,
  teardown?: () => Promise<unknown>
) {
  let store: StreamStore
  beforeAll(async () => {
    store = await getStore()
  })

  afterAll(() => store.dispose().then(teardown))

  describe('ExpectedVersion.Empty', () => {
    test('is idempotent when the exact same messages are passed', async () => {
      const streamId = v4()
      const messages = generateMessages(5)
      expect(
        await store.appendToStream(streamId, ExpectedVersion.Empty, messages)
      ).toEqual(
        await store.appendToStream(streamId, ExpectedVersion.Empty, messages)
      )
    })

    test('is idempotent when a subset of the same messages are passed', async () => {
      const streamId = v4()
      const messages = generateMessages(5)

      expect(
        await store.appendToStream(streamId, ExpectedVersion.Empty, messages)
      ).toEqual(
        await store.appendToStream(
          streamId,
          ExpectedVersion.Empty,
          messages.slice(0, messages.length - 3)
        )
      )
    })

    test('throws when there is a mismatch in some of the IDs', async () => {
      const streamId = v4()
      const messages = generateMessages(5)
      await store.appendToStream(streamId, ExpectedVersion.Empty, messages)

      const messagesWithMismatch = [...messages]
      messagesWithMismatch[2].messageId = v4()
      await throws(
        store.appendToStream(
          streamId,
          ExpectedVersion.Empty,
          messagesWithMismatch
        )
      )
    })

    test('is not idempotent when there is a previous write and a new write', async () => {
      const streamId = v4()
      const messages = generateMessages(5)

      await store.appendToStream(streamId, ExpectedVersion.Empty, messages)

      await throws(
        store.appendToStream(streamId, ExpectedVersion.Empty, [
          ...messages,
          ...generateMessages(1),
        ])
      )

      expect(
        await store
          .readStream(streamId, ReadFrom.Start, 100)
          .then((x) => x.messages.length)
      ).toBe(5)
    })
  })

  describe('ExpectedVersion.Any', () => {
    test('has the same idempotence guarantees as SqlStreamStore', async () => {
      const [m1, m2, m3, m4] = generateMessages(4)
      const streamId = v4()

      // Create stream
      await store.appendToStream(streamId, ExpectedVersion.Any, [m1, m2, m3])

      // Idempotent appends
      await store.appendToStream(streamId, ExpectedVersion.Any, [m1, m2, m3])
      await store.appendToStream(streamId, ExpectedVersion.Any, [m1, m2])
      await store.appendToStream(streamId, ExpectedVersion.Any, [m2, m3])
      await store.appendToStream(streamId, ExpectedVersion.Any, [m3])

      expect(
        await store
          .readStream(streamId, ReadFrom.Start, 10)
          .then((x) => x.messages.length)
      ).toBe(3)

      await throws(
        store.appendToStream(streamId, ExpectedVersion.Any, [m2, m1, m3])
      )
      await throws(
        store.appendToStream(streamId, ExpectedVersion.Any, [m3, m4])
      )

      expect(
        await store
          .readStream(streamId, ReadFrom.Start, 10)
          .then((x) => x.messages.length)
      ).toBe(3)
    })

    test('is idempotent when the exact same messages are passed', async () => {
      const streamId = v4()
      await store.appendToStream(
        streamId,
        ExpectedVersion.Any,
        generateMessages(5)
      )

      const messages = generateMessages(5)
      expect(
        await store.appendToStream(streamId, ExpectedVersion.Any, messages)
      ).toEqual(
        await store.appendToStream(streamId, ExpectedVersion.Any, messages)
      )
    })

    test('is idempotent when the a subset of same messages are passed', async () => {
      const streamId = v4()
      await store.appendToStream(
        streamId,
        ExpectedVersion.Any,
        generateMessages(5)
      )

      const messages = generateMessages(5)
      expect(
        await store.appendToStream(streamId, ExpectedVersion.Any, messages)
      ).toEqual(
        await store.appendToStream(
          streamId,
          ExpectedVersion.Any,
          messages.slice(2)
        )
      )

      expect(
        await store.appendToStream(streamId, ExpectedVersion.Any, messages)
      ).toEqual(
        await store.appendToStream(
          streamId,
          ExpectedVersion.Any,
          messages.slice(0, 3)
        )
      )
    })

    test('throws when there is a mismatch', async () => {
      const streamId = v4()
      await store.appendToStream(
        streamId,
        ExpectedVersion.Empty,
        generateMessages(5)
      )

      const messages = generateMessages(5)
      await store.appendToStream(streamId, ExpectedVersion.Any, messages)

      await throws(
        store.appendToStream(
          streamId,
          ExpectedVersion.Any,
          [...messages].reverse()
        )
      )
    })

    test('is not idempotent when there is a partial previous write and a new write', async () => {
      const streamId = v4()

      const messages = generateMessages(5)
      await store.appendToStream(streamId, ExpectedVersion.Any, messages)

      const err = await throws(
        store.appendToStream(streamId, ExpectedVersion.Any, [
          ...messages.slice(1),
          ...generateMessages(1),
        ])
      )

      expect(err).toBeInstanceOf(WrongExpectedVersionError)
    })

    test('is not idempotent when there is a full previous write and a new write', async () => {
      const streamId = v4()

      const messages = generateMessages(5)
      await store.appendToStream(streamId, ExpectedVersion.Any, messages)

      expect(
        await throws(
          store.appendToStream(streamId, ExpectedVersion.Any, [
            ...messages,
            ...generateMessages(1),
          ])
        )
      ).toBeInstanceOf(WrongExpectedVersionError)

      expect(
        await throws(
          store.appendToStream(streamId, ExpectedVersion.Any, [
            ...generateMessages(1),
            ...messages,
          ])
        )
      ).toBeInstanceOf(WrongExpectedVersionError)
    })
  })

  describe('stream version', () => {
    test('has the same idempotence guarantees as SqlStreamStore', async () => {
      const [m1, m2, m3, m4] = generateMessages(4)
      const streamId = v4()

      // Create stream
      await store.appendToStream(streamId, ExpectedVersion.Empty, [m1, m2, m3])

      // Idempotent appends
      await store.appendToStream(streamId, ExpectedVersion.Empty, [m1, m2, m3])
      await store.appendToStream(streamId, ExpectedVersion.Empty, [m1, m2])
      await store.appendToStream(streamId, 0, [m2, m3])
      await store.appendToStream(streamId, 1, [m3])

      expect(
        await store
          .readStream(streamId, ReadFrom.Start, 10)
          .then((x) => x.messages.length)
      ).toBe(3)

      await throws(
        store.appendToStream(streamId, ExpectedVersion.Empty, [m2, m1, m3])
      )
      await throws(store.appendToStream(streamId, 1, [m3, m4]))
      await throws(
        store.appendToStream(streamId, 1, [generateMessages(1)[0], m3])
      )

      expect(
        await store
          .readStream(streamId, ReadFrom.Start, 10)
          .then((x) => x.messages.length)
      ).toBe(3)
    })

    test('is idempotent when the exact same messages are passed', async () => {
      const streamId = v4()
      const firstResult = await store.appendToStream(
        streamId,
        ExpectedVersion.Empty,
        generateMessages(5)
      )

      const messages = generateMessages(5)
      expect(
        await store.appendToStream(
          streamId,
          firstResult.streamVersion,
          messages
        )
      ).toEqual(
        await store.appendToStream(
          streamId,
          firstResult.streamVersion,
          messages
        )
      )
    })

    test('is idempotent when a subset of the same messages are passed', async () => {
      const streamId = v4()
      const firstResult = await store.appendToStream(
        streamId,
        ExpectedVersion.Empty,
        generateMessages(5)
      )

      const messages = generateMessages(5)
      expect(
        await store.appendToStream(
          streamId,
          firstResult.streamVersion,
          messages
        )
      ).toEqual(
        await store.appendToStream(
          streamId,
          firstResult.streamVersion,
          messages.slice(0, messages.length - 2)
        )
      )

      expect(
        await store.appendToStream(
          streamId,
          firstResult.streamVersion,
          messages
        )
      ).toEqual(
        await store.appendToStream(
          streamId,
          firstResult.streamVersion + 2,
          messages.slice(2)
        )
      )
    })

    test('throws when there is a mismatch', async () => {
      const streamId = v4()
      const firstResult = await store.appendToStream(
        streamId,
        ExpectedVersion.Empty,
        generateMessages(5)
      )

      const messages = generateMessages(5)
      await store.appendToStream(streamId, firstResult.streamVersion, messages)

      let err = await throws(
        store.appendToStream(streamId, firstResult.streamVersion + 1, messages)
      )
      expect(err).toBeInstanceOf(WrongExpectedVersionError)
      err = await throws(
        store.appendToStream(
          streamId,
          firstResult.streamVersion,
          [...messages].reverse()
        )
      )
      expect(err).toBeInstanceOf(WrongExpectedVersionError)
    })

    test('is not idempotent when there is overlap', async () => {
      const streamId = v4()
      const messages = generateMessages(5)
      const appended = await store.appendToStream(
        streamId,
        ExpectedVersion.Empty,
        generateMessages(5)
      )

      await store.appendToStream(streamId, appended.streamVersion, messages)

      const err = await throws(
        store.appendToStream(streamId, appended.streamVersion, [
          ...messages,
          ...generateMessages(1),
        ])
      )
      expect(err).toBeInstanceOf(WrongExpectedVersionError)
    })

    test('throws when using a version higher than what is there', async () => {
      const streamId = v4()

      await expect(
        store.appendToStream(streamId, 0, generateMessages(10))
      ).rejects.toBeInstanceOf(WrongExpectedVersionError)

      await store.appendToStream(streamId, ExpectedVersion.Empty, [])

      await expect(
        store.appendToStream(streamId, 0, generateMessages(10))
      ).rejects.toBeInstanceOf(WrongExpectedVersionError)
    })

    test('throws on duplicate IDs', async () => {
      const streamId = v4()
      const messages = generateMessages(2)
      const initial = await store.appendToStream(
        streamId,
        ExpectedVersion.Empty,
        messages
      )

      await expect(
        store.appendToStream(streamId, initial.streamVersion, messages)
      ).rejects.toBeInstanceOf(WrongExpectedVersionError)
    })
  })
}
