import { AppendToStreamResult, ExpectedVersion } from '../../types/stream-store'
import { NewStreamMessage } from '../../types/messages'
import _ from 'lodash'
import { throws } from 'smid'
import { createPostgresStreamStore, PgStreamStore } from '../pg-stream-store'
import { v4 } from 'uuid'
import {
  ConcurrencyError,
  InconsistentStreamTypeError,
  DuplicateMessageError,
  InvalidParameterError
} from '../../errors/errors'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'

jest.setTimeout(6000000)

let store: PgStreamStore

beforeAll(async () => {
  store = createPostgresStreamStore({ ...streamStoreCfg, logger: undefined })
})

afterAll(() => store.dispose())

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

  test('throws concurrency error when creating the stream', async () => {
    const streamId = v4()
    let result: AppendToStreamResult = null!
    await expect(
      Promise.all([
        store
          .appendToStream(streamId, ExpectedVersion.Empty, generateMessages(2))
          .then(r => (result = r)),
        store
          .appendToStream(streamId, ExpectedVersion.Empty, generateMessages(2))
          .then(r => (result = r))
      ])
    ).rejects.toBeInstanceOf(ConcurrencyError)
    expect(result.streamVersion).toBe(1)
  })

  test('throws concurrency error when adding messages', async () => {
    const streamId = v4()
    let result = await store.appendToStream(
      streamId,

      ExpectedVersion.Empty,
      generateMessages(5)
    )
    expect(result.streamVersion).toBe(4)

    await expect(
      Promise.all([
        store
          .appendToStream(streamId, result.streamVersion, generateMessages(2))
          .then(r => (result = r)),
        store
          .appendToStream(streamId, result.streamVersion, generateMessages(2))
          .then(r => (result = r))
      ])
    ).rejects.toBeInstanceOf(ConcurrencyError)
    expect(result.streamVersion).toBe(6)
  })

  test('throws concurrency error when adding messages many times in parallel', async () => {
    const streamId = v4()
    let result = await store.appendToStream(
      streamId,

      ExpectedVersion.Empty,
      generateMessages(5)
    )
    expect(result.streamVersion).toBe(4)

    await expect(
      Promise.all(
        _.range(20).map(() =>
          store
            .appendToStream(streamId, result.streamVersion, generateMessages(2))
            .then(r => (result = r))
        )
      )
    ).rejects.toBeInstanceOf(ConcurrencyError)
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
      .appendToStream(
        streamId,

        ExpectedVersion.Any,
        generateMessages(2)
      )
      .then(r => (result = r))
    result = await store
      .appendToStream(
        streamId,

        ExpectedVersion.Any,
        generateMessages(2)
      )
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

  test('cannot insert duplicate messages', async () => {
    const streamId = v4()
    const messages = generateMessages(10)
    await store.appendToStream(streamId, ExpectedVersion.Any, messages)

    const err = await throws<DuplicateMessageError>(
      store.appendToStream(streamId, ExpectedVersion.Any, messages)
    )

    expect(err.id).toBe(messages[0].messageId)
  })

  test('can append with ExpectedVersion.Any in parallel without fail', async () => {
    await Promise.all(
      _.range(50).map(() =>
        store.appendToStream(v4(), ExpectedVersion.Any, generateMessages(10))
      )
    )
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

function generateMessages(count: number) {
  return _.range(count).map<NewStreamMessage>(() => {
    const msgId = v4()
    return {
      messageId: msgId,
      causationId: msgId,
      correlationId: msgId,
      data: { hello: 'world' },
      type: 'greeting'
    }
  })
}
