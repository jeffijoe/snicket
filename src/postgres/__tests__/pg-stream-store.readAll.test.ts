import { createPostgresStreamStore } from '../pg-stream-store'
import { PgStreamStoreConfig } from '../types/config'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { createPostgresStreamStoreBootstrapper } from '../setup/bootstrapper'
import { v4 } from 'uuid'
import { ExpectedVersion, ReadDirection } from '../../types/stream-store'
import { generateMessages } from './__helpers__/message-helper'
import { Position } from '../../types/messages'

let cfg: PgStreamStoreConfig = {
  ...streamStoreCfg,
  pg: {
    ...streamStoreCfg.pg,
    database: 'read_all_test'
  }
}

const store = createPostgresStreamStore(cfg)
const bootstrapper = createPostgresStreamStoreBootstrapper(cfg)

const streamId1 = v4()
const streamId2 = v4()

beforeAll(async () => {
  await bootstrapper.teardown()
  await bootstrapper.bootstrap()
  await store.appendToStream(
    streamId1,
    ExpectedVersion.Any,
    generateMessages(10)
  )
  await store.appendToStream(
    streamId2,
    ExpectedVersion.Any,
    generateMessages(10)
  )
})

afterAll(() => {
  return store.dispose().then(() => bootstrapper.teardown())
})

test('reads all messages', async () => {
  const result1 = await store.readAll('0', 10)
  expect(result1.isEnd).toBe(false)
  expect(result1.nextPosition).toBe('10')
  expect(result1.messages.length).toBe(10)

  const result2 = await store.readAll(result1.nextPosition, 10)
  expect(result2.isEnd).toBe(true)
  expect(result2.nextPosition).toBe('20')
  expect(result2.messages.length).toBe(10)

  const allResult = await store.readAll('0', 1000)
  expect(allResult.isEnd).toBe(true)
  expect(allResult.messages).toEqual([...result1.messages, ...result2.messages])

  const theEnd = await store.readAll(allResult.nextPosition, 10)
  expect(theEnd.isEnd).toBe(true)
  expect(theEnd.messages).toEqual([])
})

test('can read backwards', async () => {
  const result1 = await store.readAll(Position.End, 10, ReadDirection.Backward)
  expect(result1.isEnd).toBe(false)
  expect(result1.nextPosition).toBe('9')
  expect(result1.messages.length).toBe(10)

  const result2 = await store.readAll(
    result1.nextPosition,
    10,
    ReadDirection.Backward
  )
  expect(result2.isEnd).toBe(true)
  expect(result2.nextPosition).toBe('0')
  expect(result2.messages.length).toBe(10)

  const allResult = await store.readAll(
    Position.End,
    1000,
    ReadDirection.Backward
  )
  expect(allResult.isEnd).toBe(true)
  expect(allResult.messages).toEqual([...result1.messages, ...result2.messages])

  const theEnd = await store.readAll(
    allResult.nextPosition,
    10,
    ReadDirection.Backward
  )

  expect(theEnd.isEnd).toBe(true)

  expect(theEnd.messages).toEqual([
    result2.messages[result2.messages.length - 1]
  ])
})
