import { db, setupReadModelSchema } from './infra/pg'
import { createPostgresStreamStore } from 'snicket/lib/postgres'
import { streamStoreConfig } from './cfg'
import { InventoryItemEvent } from './inventory/events'
import { SubscribeAt } from 'snicket'
import { PoolClient } from 'pg'

// Reuse the stream store console logger cause it's pretty :D
const logger = streamStoreConfig.logger!

/**
 * The meat of the projector.
 *
 * @param client
 * @param event
 * @param version
 */
async function processMessage(
  client: PoolClient,
  event: InventoryItemEvent,
  version: number
) {
  switch (event.type) {
    case 'InventoryItemCreated': {
      await client.query(
        'insert into inventory (id, name, _version) values($1, $2, $3);',
        [event.id, event.name, version]
      )
      break
    }
    case 'InventoryItemRenamed': {
      await client.query(
        'update inventory set name = $2, _version = $3 where id = $1 ;',
        [event.id, event.newName, version]
      )
      break
    }
    case 'ItemsCheckedInToInventory': {
      const current = await db
        .query('select quantity_in_stock from inventory where id = $1;', [
          event.id,
        ])
        .then((r) => r.rows[0].quantity_in_stock)
      await client.query(
        'update inventory set quantity_in_stock = $2, _version = $3 where id = $1;',
        [event.id, current + event.count, version]
      )
      break
    }
    case 'ItemsRemovedFromInventory': {
      const current = await db
        .query('select quantity_in_stock from inventory where id = $1;', [
          event.id,
        ])
        .then((r) => r.rows[0].quantity_in_stock)
      await client.query(
        'update inventory set quantity_in_stock = $2, _version = $3 where id = $1;',
        [event.id, current - event.count, version]
      )
      break
    }
    case 'InventoryItemDeactivated': {
      await client.query(
        'update inventory set activated = true, deactivation_reason = $2, _version = $3 where id = $1;',
        [event.id, event.reason, version]
      )
      break
    }
  }
}

/**
 * Projects our inventory events into a Postgres table.
 * At the end, it writes the last seen message position to the checkpoint table.
 * On startup, that checkpoint is loaded, then we subscribe from there.
 * This means you can kill the projector and bring it back up at any time with
 * no data corruption, because every message is processed in serial and in a transaction,
 * meaning that the row update + checkpoint update is atomic.
 */
async function main() {
  logger.info('Setting up read model schema.')
  await setupReadModelSchema()
  const store = createPostgresStreamStore(streamStoreConfig)
  logger.info('Querying for checkpoint')
  const positionResult = await db.query(
    `select position from checkpoint where id = 'inventory'`
  )
  let position = SubscribeAt.Beginning
  if (positionResult.rows.length === 0) {
    await db.query(
      `insert into checkpoint (id, position) values('inventory', -2);`
    )
    logger.info('No checkpoint, starting from the beginning.')
  } else {
    position = positionResult.rows[0].position
    logger.info('Found checkpoint: ' + position)
  }
  logger.info('Subscribing at ' + position)
  await store.subscribeToAll(
    async (msg) => {
      const data = msg.data as InventoryItemEvent
      const client = await db.connect()
      try {
        await client.query('BEGIN;')

        await processMessage(client, data, msg.streamVersion)

        // Update the checkpoint and commit the transaction
        await client.query(
          `update checkpoint set position = $1 where id = 'inventory';`,
          [msg.position]
        )
        await client.query('COMMIT;')
        logger.info(`Handled ${data.type}, checkpoint is ${msg.position}`)
      } catch (err) {
        logger.error('error while processing message', { data, err })
        // Usually you'd want to inspect the error to know whether the error is transient
        // or if it's a bug in your projection code. If a bug, you should probably
        // log it and move on to not stop the world.
        throw err
      } finally {
        client.release()
      }
    },
    {
      afterPosition: position,
      onSubscriptionDropped: () => {
        logger.error('Subscription dropped. Nothing left to live for.')
        process.exit(1)
      },
    }
  )
  logger.info('Subscription started.')
}

main().catch((err) => {
  logger.error('Error in main', err)
  process.exitCode = 1
})
