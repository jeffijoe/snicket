import { ExpectedVersion } from '../../types/stream-store'
import { createPostgresStreamStore } from '../pg-stream-store'
import { streamStoreCfg } from '../../__helpers__/pg-stream-store-config'
import { v4 } from 'uuid'
import { generateMessages } from './__helpers__/message-helper'
import { createClock } from '../../__helpers__/clock'

const disposers: Array<Function> = []
afterAll(() => Promise.all(disposers.map(f => f())))

test('scavenges stream with a max age on append', async () => {
  const clock = createClock()
  const store = createPostgresStreamStore({
    ...streamStoreCfg,
    scavengeSynchronously: true,
    getCurrentTime: clock.get
  })

  disposers.push(store.dispose)

  // Start out with writing 5 messages, no expiration on yet.
  const streamId = v4()
  let write = await store.appendToStream(
    streamId,
    ExpectedVersion.Empty,
    generateMessages(5)
  )

  let read = await store.readStream(streamId, 0, 100)
  expect(read.messages).toHaveLength(5)

  // Advance time by 5 seconds, set the maxAge to 10 seconds.
  // This triggers a scavenge of old messages as well, but since 10 seconds haven't
  // passed since we wrote the first messages, we will still have 5 messages in the stream.
  clock.tick('5s')
  await store.setStreamMetadata(streamId, ExpectedVersion.Empty, {
    maxAge: 10
  })
  read = await store.readStream(streamId, 0, 100)
  expect(read.messages).toHaveLength(5)

  // Advance time by 2 seconds, write another 5 messages.
  // We are not 7 seconds in from when the first messages were written,
  // so still no expiration
  clock.tick('2s')
  write = await store.appendToStream(
    streamId,
    write.streamVersion,
    generateMessages(5)
  )
  read = await store.readStream(streamId, 0, 100)
  expect(read.messages).toHaveLength(10)

  // Advance time by 4 seconds, now we are 11 seconds after the first 5 messages were written,
  // so after this append, we will only have 10 messages in the stream.
  clock.tick('4s')

  write = await store.appendToStream(
    streamId,
    write.streamVersion,
    generateMessages(5)
  )
  read = await store.readStream(streamId, 0, 100)
  expect(read.messages).toHaveLength(10)
})
