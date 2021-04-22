# Snicket

An interface + Node.JS and **Postgres 9.4+** implementation of a Stream/Event/Message Store.

Useful for Event Sourcing.

[![npm](https://img.shields.io/npm/v/snicket.svg?maxAge=1000)](https://www.npmjs.com/package/snicket)
[![dependency Status](https://img.shields.io/david/jeffijoe/snicket.svg?maxAge=1000)](https://david-dm.org/jeffijoe/snicket)
[![devDependency Status](https://img.shields.io/david/dev/jeffijoe/snicket.svg?maxAge=1000)](https://david-dm.org/jeffijoe/snicket)
[![Build Status](https://img.shields.io/travis/jeffijoe/snicket.svg?maxAge=1000)](https://travis-ci.org/jeffijoe/snicket)
[![Coveralls](https://img.shields.io/coveralls/jeffijoe/snicket.svg?maxAge=1000)](https://coveralls.io/github/jeffijoe/snicket)
[![npm](https://img.shields.io/npm/dt/snicket.svg?maxAge=1000)](https://www.npmjs.com/package/snicket)
[![npm](https://img.shields.io/npm/l/snicket.svg?maxAge=1000)](https://github.com/jeffijoe/snicket/blob/master/LICENSE.md)

# Table of Contents

- [Snicket](#snicket)
- [Table of Contents](#table-of-contents)
- [Installing](#installing)
- [Setting it up](#setting-it-up)
- [Quick Start](#quick-start)
- [Concepts](#concepts)
- [Appending](#appending)
- [Reading](#reading)
  - [Filtering Expired Messages](#filtering-expired-messages)
  - [Listing Streams](#listing-streams)
- [Stream Metadata](#stream-metadata)
- [Scavenging](#scavenging)
- [Subscriptions](#subscriptions)
  - [Subscribing to a stream](#subscribing-to-a-stream)
  - [Subscribing to the all-stream](#subscribing-to-the-all-stream)
  - [Notifiers](#notifiers)
- [Idempotency](#idempotency)
  - [Idempotency for `ExpectedVersion.Any`](#idempotency-for-expectedversionany)
  - [Idempotency when specifying an explicit version](#idempotency-when-specifying-an-explicit-version)
- [Gap Detection](#gap-detection)
- [Serialization](#serialization)
- [Postgres Performance](#postgres-performance)
  - [Use a connection pooler (PgBouncer, pg-pool, etc)](#use-a-connection-pooler-pgbouncer-pg-pool-etc)
    - [Gotcha: `pg-notify` notifier](#gotcha-pg-notify-notifier)
  - [Use read-write split](#use-read-write-split)
    - [Gotcha: DO NOT use `pg-notify` notifier](#gotcha-do-not-use-pg-notify-notifier)
- [Logging](#logging)
- [In-Memory Stream Store](#in-memory-stream-store)
- [About](#about)

# Installing

Get it on npm:

```bash
npm install snicket
```

Currently, Snicket only supports a Postgres implementation, so you also need to install `pg`. It's listed as a `peerDependency` in case we add support for other backends, that way we don't install drivers for backends we don't use.

```bash
npm install pg
```

# Setting it up

> This is the setup for the Postgres implementation. 
> There's also an [in-memory implementation](#in-memory-stream-store) if you just want to play around with it. The API is the exact same.

You can either run the Snicket Postgres setup tool:

```bash
# Run `npx snicket-pg` to view available parameters.
npx snicket-pg setup
```

Or you can use the bootstrapper:

```ts
import { createPostgresStreamStoreBootstrapper } from 'snicket/lib/postgres'

const bootstrapper = createPostgresStreamStoreBootstrapper({
  pg: {
    // Postgres options here; see typings.
  }
})

bootstrapper.bootstrap()
  .then(() => console.log('Woohoo! :)'))
  .catch(err => console.log('Boohoo! :(', err))
```

The code approach gives you more control and let's you use whatever config system you want.

# Quick Start

If you're looking for a complete example covering CQRS and ES basics, see the [Simple CQRS/ES Inventory sample](examples/simple-cqrs-es-inventory).

A super quick guide to getting started with the essentials.

```ts
import * as uuid from 'uuid'
import { ExpectedVersion, SubscribeAt } from 'snicket'
import { createPostgresStreamStore } from 'snicket/lib/postgres'

const store = createPostgresStreamStore({
  pg: { /* same as above */ }
})

// Appending to a stream.
const appendResult = await store.appendToStream(
  'account-123',
  ExpectedVersion.Empty, // Will throw if there's already data in the stream.
  [{
    messageId: uuid.v4(),
    type: 'MoneyDeposited',
    data: {
      amount: 10
    }
  }]
)

// Optimistic concurrency control is built-in.
await store.appendToStream(
  'account-123',
  // Pass in the last known version. Will throw on conflict.
  appendResult.streamVersion,
  [{
    messageId: uuid.v4(),
    type: 'MoneyWithdrawn',
    data: {
      amount: 4
    }
  }]
)

// Let's read it back.
const streamPage = await store.readStream(
  'account-123',
  0,  // From what stream version?
  100 // How many to read?
)
console.log(streamPage.messages) // Logs the 2 messages we wrote

// We can subscribe to all messages written to the store.
// `await` simply waits until the subscription has been established.
const subscription = await store.subscribeToAll(
  // Invokes for every message.
  // Runs in serial; the next message is not passed until the promise resolves.
  async message => { console.log(message) },
  // Let's have the subscription catch up from the beginning of time.
  {
    afterPosition: SubscribeAt.Beginning
  }
)

// Finally, the store can be disposed, which will wait until all
// write operations + current subscription invocations have finished before closing connections
await store.dispose()
```

# Concepts

The following terms will be thrown around a lot:

- **Stream Store** — the interface for writing to and reading from streams.
- **Stream** — an ordered log of _messages_ with an ID.
- **Stream Metadata** — additional data on a stream, some used for operations.
- **Append** — adding messages to the end of a stream; the only way of getting data in.
- **Message** — a single message within a stream
- **Message Type** — a string that makes sense in whatever context you are building for; could be `MoneyDeposited` if you are building a banking system.
- **Message Data** — the actual message payload
- **Message Metadata** — additional data on the message
- **Expected Version** — used for concurrency control; only allows appends when the DB version and the one we pass in are the same.
- **Subscriptions** — Subscribing to be notified of new messages.
- **Max Count, Max Age, Truncate Before** — stream metadata used for automatically scavenging old messages
- **Scavenging** — removal of old messages that have been configured to "fall off".
- **Disposing** — cleaning up resources, like the DB connection, while also waiting for ongoing operations to finish.

# Appending

It all starts with getting messages into a stream. Since a stream is a log of immutable messages, the only way to get data into a stream is by appending to it.

This will create a stream with ID `account-123` if it doesn't exist. By specifying `ExpectedVersion.Empty`, we will only allow the append if the stream is in fact empty.

```ts
const appendResult = await store.appendToStream(
  'account-123',
  ExpectedVersion.Empty,
  [{
    messageId: uuid.v4(),
    type: 'MoneyDeposited',
    data: {
      amount: 10
    }
  }]
)
```

The append result will contain the stream's new version. We can use this for subsequent appends if we want to.

```ts
await store.appendToStream(
  'account-123',
  // Pass in the last known version. Will throw on conflict.
  appendResult.streamVersion,
  [{
    messageId: uuid.v4(),
    type: 'MoneyWithdrawn',
    data: {
      amount: 4
    }
  }]
)
```

If there's an expected-version mismatch, a `WrongExpectedVersionError` is thrown.

```ts
import { WrongExpectedVersionError } from 'snicket'

await store.appendToStream(
  'account-123',
  // Same version as from the first write.
  // Problem is, someone (well.. us!) already appended new messages!
  appendResult.streamVersion,
  [{
    messageId: uuid.v4(),
    type: 'MoneyWithdrawn',
    data: {
      amount: 8
    }
  }]
).catch(err => {
  console.error(err) // WrongExpectedVersionError: ...
})
```

If we don't care about the order of messages, we can pass in `ExpectedVersion.Any`.

# Reading

Appending data to streams wouldn't be very useful if we couldn't read them back out again.

A stream can be read back using `readStream`:

```ts
let streamPage = await store.readStream(
  'account-123',
  0,  // From what stream version?
  100 // How many to read?
)

// We get a stream read page back with a batch of messages.
console.log(streamPage.messages)

// It will tell us whether we reached the end:
if (streamPage.isEnd === false) {
  // We can read the next page like so:
  streamPage = await store.readStream(
    'account-123',
    streamPage.nextVersion,
    100
  )
}
```

We can also read all messages from all streams back in the order they were saved.

```ts
import { ReadFrom } from 'snicket'
let allPage = await store.readAll(
  ReadFrom.Start,  // From what global position?
  100 // How many to read?
)

// We get a read page back with a batch of messages.
console.log(allPage.messages)

// It will tell us whether we reached the end:
if (allPage.isEnd === false) {
  // We can read the next page like so:
  allPage = await store.readAll(
    allPage.nextPosition,
    100
  )
}
```

Both reads support reading backwards, too.

```ts
import { ReadDirection } from 'snicket'

await store.readAll(
  ReadFrom.Start, 
  100,
  ReadDirection.Backward // The default is `Forward`.
)

// The `next*` properties will also reflect this,
// so you can page both ways.
allPage = await store.readAll(
  allPage.nextPosition,
  100,
  ReadDirection.Backward
)
```

## Filtering Expired Messages

The default options are optimized for speed. Due to this, expired messages won't be filtered out and scheduled for purging. This is because reading the all-stream would require looking up stream metadata for each unique stream it finds in order to filter out expired messages. If you are not even using Max Age, then this is wasted work.

This is why filtering expired messages is **opt-in**:

```ts
const store = createPostgresStreamStore({
  reading: {
    filterExpiredMessages: true
  }
})
```

## Listing Streams

If you need to list the stream IDs in the store, there's a handy `listStreams` function.

```ts
// Get the first 10 stream IDs
const page1 = await store.listStreams(10)
console.log(page1.streamIds)

// Get the next 10
const page2 = await store.listStreams(10, page1.cursor)
```

# Stream Metadata

A Stream can have metadata, which is actually itself tracked as a stream of metadata messages! That's pretty... meta.

To set your own meta, simply pass a `meta: { ... }` in the options object.

There are a few "special" attributes that will affect **scavenging**:

- `maxAge` — The amount of time (in seconds) that messages in the stream are valid for. Messages older than this won't be returned, and become eligible for scavenging.
- `maxCount` — The max amount of messages allowed in the stream. When appending to a stream with `maxCount` set, it will purge extraneous messages.
- `truncateBefore` — Messages with a stream version older than (but not including) this will become eligible for scavenging.

Let's try setting some Stream Metadata:

```ts
const setMetadataResult = await store.setStreamMetadata(
  'account-123',
  ExpectedVersion.Empty, // The Stream Metadata stream has it's own version!
  {
    maxAge: 60 // Messages older than 1 minute won't be returned and will be purged eventually
  }
)
```

**Important**: omitting any of the properties on the meta object is effectively the same as unsetting them!

For example, let's unset the max age and add our own piece of meta:

```ts
await store.setStreamMetadata(
  'account-123',
  setMetadataResult.currentVersion,
  {
    meta: {
      customer_region: 'eu-west' // Can be whatever you want!
    }
  }
)
```

Because we didn't specify the `maxAge`, it will be set to `null` which means disabled.

# Scavenging

If the stream metadata mandates it, appending to a stream will also scavenge it for old messages to remove.

This is done asynchronously, meaning it won't affect your append time. This also means that if you're fast, you can potentially read messages that would otherwise have been scavenged if you read immediately after appending. This is essentially a race condition, but not something that should break your application's behavior.

If you want to make this synchronous (meaning the append won't return until the scavenge on the stream completes), you can pass `scavengeSynchronously: true` to the stream store options.

Setting stream metadata itself also triggers a scavenge on the actual stream, however this is always synchronous.

# Subscriptions

Snicket provides a basic Consumer-based Subscription API over individual streams with `subscribeToStream`, as well as a way to subscribe to every stream at once, using `subscribeToAll`. Being consumer-based, it is up to you to save the "last seen" checkpoint, and provide it upon starting a subscription.

`subscribeToStream` uses the stream version as a checkpoint, while `subscribeToAll` uses the global message position.

If no subscription options are passed, they subscribe to the head, meaning only messages appended after the subscription started will appear.

Both functions return a `Subscription` which can be disposed using `await subscription.dispose()`.

The message processor will be called in serial, and can return a promise. This is great because you don't have to worry about race conditions in your processing code as long as you are only running one instance at a time.

Common Subscription options:

- `maxCountPerRead` — how many messages to read per pull.
- `onCaughtUpChanged` — a callback with a single parameter `caughtUp: boolean`. Invoked whenever the catch-up status changes (when the subscription is reading the latest messages), and when it falls behind (when the subscription is reading a batch of messages that isn't the latest batch).
- `onSubscriptionDropped` — if the message processor throws an error, the subscription is dropped and this callback is invoked.
- `dispose` — when the subscription is disposed, this callback is called and can return a promise.

## Subscribing to a stream

To subscribe to a single stream:

```ts
await store.subscribeToStream(
  'account-123',
  async message => { console.log(message) },
  {
    afterVersion: SubscribeAt.Beginning
  }
)
```

## Subscribing to the all-stream

To subscribe to the all-stream:

```ts
await store.subscribeToAll(
  async message => { console.log(message) },
  {
    afterPosition: SubscribeAt.Beginning
  }
)
```

## Notifiers

In order for Snicket to know when new messages are available, it must receive a signal from a *notifier*.

There are 2 types of notifiers.

* `poll` (default) — queries for the head position (the last known highest message number), and compares it to the last number it read. If they differ, it emits a signal. By default it does this every 500ms.
* `pg-notify` — uses `pg_notify` after every append which will serve as the signal. This is faster than `poll` but might not be available/reliable on your Postgres PaaS.

To switch to the `pg-notify` notifier, create your stream store like so:

```ts
createPostgresStreamStore({
  notifier: {
    type: 'pg-notify',
    // Send a heartbeat query to Postgres every 5 minutes to keep the connection alive.
    keepAliveInterval: 5 * 60 * 1000
  }
})
```

Alternatively, if you just want to change the polling interval:

```ts
createPostgresStreamStore({
  notifier: {
    type: 'poll',
    pollingInterval: 2000
  }
})
```

# Idempotency

Similar to SqlStreamStore and EventStore, Snicket is idempotent when appending messages with the same ID, if and only if certain conditions are met.

This is very useful when using deterministic message IDs (`node-uuid`'s `v5`!)

## Idempotency for `ExpectedVersion.Any`

If the specified messages have been previously written in the same order they appear in the append request, no new messages are written. 
If the message ordering is different, or if there are additional new messages with the previous written ones, then a `WrongExpectedVersionError` is thrown. 

Examples:

```ts
const [m1, m2, m3, m4] = generateMessages(4)
const streamId = v4()

// Create stream
await store.appendToStream(streamId, ExpectedVersion.Any, [m1, m2, m3])

// Idempotent appends
await store.appendToStream(streamId, ExpectedVersion.Any, [m1, m2, m3])
await store.appendToStream(streamId, ExpectedVersion.Any, [m1, m2])
await store.appendToStream(streamId, ExpectedVersion.Any, [m2, m3])
await store.appendToStream(streamId, ExpectedVersion.Any, [m3])

// Not idempotent, different order
await throws(
  store.appendToStream(streamId, ExpectedVersion.Any, [m2, m1, m3])
)
// Not idempotent, partial previous write (m3) and a new write (m4)
await throws(
  store.appendToStream(streamId, ExpectedVersion.Any, [m3, m4])
)

```

## Idempotency when specifying an explicit version

If the specified messages have been previously written in the same order they appear in the append request starting at the expected version, 
no new messages are written.

Examples:

```ts
const [m1, m2, m3, m4] = generateMessages(4)
const streamId = v4()

// Create stream
await store.appendToStream(streamId, ExpectedVersion.Empty, [m1, m2, m3])

// Idempotent appends
await store.appendToStream(streamId, ExpectedVersion.Empty, [m1, m2, m3])
await store.appendToStream(streamId, ExpectedVersion.Empty, [m1, m2])
await store.appendToStream(streamId, 0, [m2, m3])
await store.appendToStream(streamId, 1, [m3])

// Not idempotent, different order
await throws(
  store.appendToStream(streamId, ExpectedVersion.Empty, [m2, m1, m3])
)
// Not idempotent, partial previous write (m3) and a new write (m4)
await throws(store.appendToStream(streamId, 1, [m3, m4]))
```

# Gap Detection

During high load, it is natural for sequence gaps to occur in RDBMSes as transactions are rolled back due to conflicts. This is one way of gaps forming, and is harmless.

The more harmful gaps are those where the commit for messages with a higher sequence number to appear in a read before an earlier commit with lower sequence numbers due to not having been written yet, even though the order has been determined. This means that a live subscription that is chasing the head of the all-stream would potentially skip messages during high load.

This is obviously terrible, so Snicket will detect these gaps, wait a few seconds, then re-issue the read. It will do this *one time*, and if the gaps are still present, then they are either due to transaction rollbacks or deleted messages.

You can configure these parameters when creating the stream store:

- `gapReloadTimes` — how many times to reload if gaps are persisting? Default is `1`
- `gapReloadDelay` — how long to wait before issuing the next reload. Default is  `5000` (5 seconds)

```ts
const store = createPostgresStreamStore({
  gapReloadTimes: 1,
  gapReloadDelay: 5000
})
```

# Serialization

In the Postgres implementation, **message data and metadata** are stored as `jsonb`, and the default serializer simply uses `JSON.parse` and `JSON.stringify`.

```ts
import { jsonSerializer } from 'snicket'

const store = createPostgresStreamStore({
  pg: { /*...*/ },
  serializer: jsonSerializer // This is the default.
})
```

It's essentially this:

```ts
const jsonSerializer = {
  serialize: JSON.stringify,
  deserialize: JSON.parse
}
```

You can create another JSON serializer that also revives `ISO-8601` date strings into `Date` instances.

```ts
import { createJsonSerializer } from 'snicket'

const store = createPostgresStreamStore({
  pg: { /*...*/ },
  // This will deserialize all date fields as `Date` instances.
  serializer: createJsonSerializer({ reviveDates: true })
})
```

You can also plug in any other serialization format that will result in a string.

# Postgres Performance

There are a few things you can do on the Postgres side with minimal configuration changes to Snicket to improve performance.

## Use a connection pooler (PgBouncer, pg-pool, etc)

Snicket itself uses the built-in `pg-pool` and exposes the following pooling-related options on the `pg` configuration object:

- `min`: the minimum amount of connections to keep in the pool.
- `max`: the maximum amount of connections to keep in the pool.
- `idleTimeoutMillis`: if a connection is idle, close it completely after this amount of time.

Even so, when scaling out your application, you will likely run into server-side connection starvation.

When running Postgres at scale, it is not uncommon to use a connection pooler such as [PgBouncer](http://pgbouncer.org) since Postgres
itself does not do well with a ton of open connections. When using PgBouncer, you will be able to increase the `min` and `max` connections
rather generously.

### Gotcha: `pg-notify` notifier

Snicket supports using Postgres' native `LISTEN/NOTIFY`, but `LISTEN` does not work when using **transaction pooling**. That is why the notifier configuration
allows to specify connection overrides so you can use either a direct connection to Postgres, and/or another user/password combination in order to target a 
session-pooled configuration.

```ts
createPostgresStreamStore({
  notifier: {
    type: 'pg-notify',
    host: 'real-postgres-or-whatever', // optional
    port: 6543, // optional
    user: 'session-pooled-user-or-whatever',
    password: 'P@ssw0rd', // optional
  }
})
```

## Use read-write split

It's kind of funny how CQRS can be applied to the infrastructure that itself supports building CQRS + Event-sourced applications. 🤓

If you configure a Postgres standby server with asynchronous streaming replication, you will get an **eventually-consistent read replica** that you can use 
to read from. So it makes perfect sense to create a 2nd stream store instance that points to a read replica, and use that for read-intensive areas such as subscriptions
or just reading in general. This takes load off the primary as well.

### Gotcha: DO NOT use `pg-notify` notifier

The `pg-notify` notifier is not compatible with using a read replica because Postgres read replicas do not support it.
Even if they did, there is no guarantee that the replica has replicated the written messages by the time we get the notification,
so you should not attempt to configure the notifier to use the primary if you are going to use the read replica for subscriptions.

Instead, since the read-replica is taking load off the primary, you can use a relatively low polling interval like `100` milliseconds (adjust to taste).

# Logging

By default, logs are being sent into a black hole using the `noopLogger`. You can use the console logger if you want some more insight.

```ts
import { createConsoleLogger } from 'snicket'

const store = createPostgresStreamStore({
  logger: createConsoleLogger('trace') // Specify a log level: trace, debug, info, warn, error
})
```

You can also create your own logger. See the implementation of the noop logger for a template.

# In-Memory Stream Store

There's an in-memory implementation that is useful for testing, or if you just want to play around
without setting up a Postgres database.

Naturally, being in-memory only means there's no persistence.

```ts
import { createInMemoryStreamStore } from 'snicket/lib/in-memory'

const store = createInMemoryStreamStore()
```

# About

Built by Jeff Hansen - [@Jeffijoe](https://twitter.com/Jeffijoe) - with a lot of inspiration from [SQL Stream Store](https://github.com/SQLStreamStore/SQLStreamStore) (.NET)

The name **Snicket** comes from _A Series of Unfortunate Events_

... _Events_... Get it?
