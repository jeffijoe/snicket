import { throws } from 'smid'
import { StreamStore, ExpectedVersion } from '..'
import { v4 } from 'uuid'
import { generateMessages } from '../__helpers__/message-helper'
import { ConcurrencyError } from '../errors/errors'

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

    test('can include more messages as long as the entire previous write is included', async () => {
      const streamId = v4()
      const messages = generateMessages(5)

      await store.appendToStream(streamId, ExpectedVersion.Empty, messages)

      await store.appendToStream(streamId, ExpectedVersion.Empty, [
        ...messages,
        ...generateMessages(1)
      ])
    })
  })

  describe('ExpectedVersion.Any', () => {
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
          ...generateMessages(1)
        ])
      )

      expect(err).toBeInstanceOf(ConcurrencyError)
    })
  })

  describe('stream version', () => {
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
      expect(err).toBeInstanceOf(ConcurrencyError)
      err = await throws(
        store.appendToStream(
          streamId,
          firstResult.streamVersion,
          [...messages].reverse()
        )
      )
      expect(err).toBeInstanceOf(ConcurrencyError)
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
          ...generateMessages(1)
        ])
      )
      expect(err).toBeInstanceOf(ConcurrencyError)
    })
  })
}
