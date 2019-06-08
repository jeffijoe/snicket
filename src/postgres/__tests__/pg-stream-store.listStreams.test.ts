import _ from 'lodash'
import * as uuid from 'uuid'
import { createPostgresStreamStoreBootstrapper } from '../setup/bootstrapper'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { createPostgresStreamStore } from '../pg-stream-store'
import { PgStreamStoreConfig } from '../types/config'
import { ExpectedVersion } from '../../types/stream-store'
import { generateMessages } from './__helpers__/message-helper'

const cfg: PgStreamStoreConfig = {
  ...streamStoreCfg,
  pg: {
    ...streamStoreCfg.pg,
    database: 'list_streams_test'
  }
}

const store = createPostgresStreamStore(cfg)
const bootstrapper = createPostgresStreamStoreBootstrapper(cfg)

beforeAll(() => bootstrapper.bootstrap())
afterAll(() => Promise.all([store.dispose(), bootstrapper.teardown()]))

test('listStreams', async () => {
  const empty = await store.listStreams(10)
  expect(empty.streamIds).toHaveLength(0)

  await Promise.all(
    _.range(20).map(i =>
      store.appendToStream(
        uuid.v4(),
        ExpectedVersion.Empty,
        generateMessages(5)
      )
    )
  )

  const firstPage = await store.listStreams(10)
  expect(firstPage.streamIds).toHaveLength(10)
  // Assert the stream IDs point to the streams we created.
  await Promise.all(
    firstPage.streamIds.map(streamId =>
      expect(
        store.readStream(streamId, 0, 10).then(r => r.messages)
      ).resolves.toHaveLength(5)
    )
  )

  const secondPage = await store.listStreams(15, firstPage.cursor)
  expect(secondPage.streamIds).toHaveLength(10)
  await Promise.all(
    secondPage.streamIds.map(streamId =>
      expect(
        store.readStream(streamId, 0, 10).then(r => r.messages)
      ).resolves.toHaveLength(5)
    )
  )

  const thirdPage = await store.listStreams(15, secondPage.cursor)
  expect(thirdPage.streamIds).toHaveLength(0)
  await Promise.all(
    thirdPage.streamIds.map(streamId =>
      expect(
        store.readStream(streamId, 0, 10).then(r => r.messages)
      ).resolves.toHaveLength(5)
    )
  )
})
