import { createPostgresStreamStoreBootstrapper } from '../setup/bootstrapper'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { createPostgresStreamStore } from '../pg-stream-store'
import { v4 } from 'uuid'
import { ExpectedVersion } from '../../types/stream-store'
import { generateMessages } from './__helpers__/message-helper'
import { PgStreamStoreConfig } from '../types/config'

describe('readHeadPosition', () => {
  test('returns the correct position', async () => {
    const cfg = {
      ...streamStoreCfg,
      pg: {
        ...streamStoreCfg.pg,
        database: 'read_head_position_test'
      }
    } as PgStreamStoreConfig
    const bootstrapper = createPostgresStreamStoreBootstrapper(cfg)
    await bootstrapper.teardown()
    await bootstrapper.bootstrap()

    const store = createPostgresStreamStore(cfg)
    const streamId1 = v4()
    const streamId2 = v4()
    await Promise.all([
      store.appendToStream(
        streamId1,
        ExpectedVersion.Empty,
        generateMessages(10)
      ),
      store.appendToStream(
        streamId2,
        ExpectedVersion.Empty,
        generateMessages(10)
      )
    ])

    const pos1 = await store.readHeadPosition()
    expect(pos1).toBe('19')

    await Promise.all([
      store.appendToStream(
        streamId1,
        ExpectedVersion.Any,
        generateMessages(10)
      ),
      store.appendToStream(streamId2, ExpectedVersion.Any, generateMessages(10))
    ])

    const pos2 = await store.readHeadPosition()
    expect(pos2).toBe('39')

    await store.dispose()
    await bootstrapper.teardown()
  })
})
