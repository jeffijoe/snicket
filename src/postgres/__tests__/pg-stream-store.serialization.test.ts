import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { createPostgresStreamStore } from '../pg-stream-store'
import { createJsonSerializer } from '../../serialization/json'
import { v4 } from 'uuid'
import { ExpectedVersion, StreamStore } from '../../types/stream-store'
import { generateMessages } from './__helpers__/message-helper'
import { PgStreamStoreConfig } from '../types/config'
import { createPostgresStreamStoreBootstrapper } from '../setup/bootstrapper'
import {
  waitForStreamSubscription,
  waitForAllSubscription
} from '../../__helpers__/wait-helper'

const cfg: PgStreamStoreConfig = {
  ...streamStoreCfg,
  pg: {
    ...streamStoreCfg.pg,
    database: 'serialize_test'
  },
  notifier: {
    type: 'pg-notify'
  },
  serializer: createJsonSerializer({ reviveDates: true })
}

const bootstrapper = createPostgresStreamStoreBootstrapper(cfg)
let store: StreamStore
beforeAll(async () => {
  await bootstrapper.bootstrap()
  store = createPostgresStreamStore(cfg)
})

afterAll(() => store.dispose().then(bootstrapper.teardown))

test('serialization with date reviver', async () => {
  const streamId = v4()
  const messages = [
    {
      ...generateMessages(1)[0],
      data: {
        itsA: new Date(10)
      },
      meta: {
        metadate: new Date(20)
      }
    },
    {
      ...generateMessages(1)[0],
      data: [{ wo: 'ah' }]
    },
    {
      ...generateMessages(1)[0],
      data: 'woah'
    },
    {
      ...generateMessages(1)[0],
      data: ['woah']
    }
  ]
  await store.appendToStream(streamId, ExpectedVersion.Empty, messages)
  const streamPage = await store.readStream(streamId, 0, 10)
  expect(streamPage.messages[0].data.itsA).toStrictEqual(new Date(10))
  expect(streamPage.messages[0].meta.metadate).toStrictEqual(new Date(20))

  const allPage = await store.readAll(0, 10)
  expect(allPage.messages[0].data.itsA).toStrictEqual(new Date(10))
  expect(allPage.messages[0].meta.metadate).toStrictEqual(new Date(20))
  expect(allPage.messages[1].data[0].wo).toStrictEqual('ah')
  expect(allPage.messages[2].data).toStrictEqual('woah')
  expect(allPage.messages[3].data[0]).toStrictEqual('woah')

  await waitForStreamSubscription(
    store,
    streamId,
    msg =>
      msg.data.itsA.valueOf() === new Date(10).valueOf() &&
      msg.meta.metadate.valueOf() === new Date(20).valueOf()
  )
  await waitForAllSubscription(
    store,
    msg =>
      msg.data.itsA.valueOf() === new Date(10).valueOf() &&
      msg.meta.metadate.valueOf() === new Date(20).valueOf()
  )
})
