import { createPostgresStreamStore } from 'streamsource/lib/postgres'
import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import { streamStoreConfig } from './cfg'
import uuid from 'uuid'
import * as Dispatcher from './infra/dispatcher'
import * as Inventory from './inventory'
import * as CommandHandlers from './inventory/command-handlers'
import { db } from './infra/pg'
const gracefulShutdown = require('http-graceful-shutdown')
const R = require('koa-route')

/*
 A super basic Koa-based API.
 */

// Might as well reuse the stream store console logger, it's pretty :D
const logger = streamStoreConfig.logger!
const store = createPostgresStreamStore(streamStoreConfig)

// Register some command handlers.
Dispatcher.register<Inventory.CreateInventoryItem>(
  'CreateInventoryItem',
  CommandHandlers.makeCreateInventoryItemHandler(store)
)
Dispatcher.register<Inventory.RenameItem>(
  'RenameItem',
  CommandHandlers.makeRenameItemHandler(store)
)
Dispatcher.register<Inventory.CheckIn>(
  'CheckIn',
  CommandHandlers.makeCheckInHandler(store)
)
Dispatcher.register<Inventory.Remove>(
  'Remove',
  CommandHandlers.makeRemoveHandler(store)
)
Dispatcher.register<Inventory.Deactivate>(
  'Deactivate',
  CommandHandlers.makeDeactivateHandler(store)
)

// Set up a Koa app to expose our awesome app to the world.
const app = new Koa()
app.use(bodyParser())
app.use(async (ctx: any, next: any) => {
  try {
    await next()
  } catch (err) {
    ctx.status = 500
    ctx.body = {
      error: err.message
    }
    logger.error('Error in request', err)
  }
})

const controller = {
  // Writes
  async createItem(ctx: any) {
    const newId = uuid.v4()
    await Dispatcher.dispatch(
      Inventory.CreateInventoryItem(newId, ctx.request.body.name)
    )
    ctx.set('Location', '/inventory/' + newId)
    ctx.body = { id: newId }
    ctx.status = 201
  },
  async renameItem(ctx: any, id: string) {
    await Dispatcher.dispatch(Inventory.RenameItem(id, ctx.request.body.name))
    ctx.set('Location', '/inventory/' + id)
    ctx.body = { id }
    ctx.status = 204
  },
  async checkIn(ctx: any, id: string) {
    await Dispatcher.dispatch(Inventory.CheckIn(id, ctx.request.body.count))
    ctx.set('Location', '/inventory/' + id)
    ctx.body = { id }
    ctx.status = 204
  },
  async remove(ctx: any, id: string) {
    await Dispatcher.dispatch(Inventory.Remove(id, ctx.request.body.count))
    ctx.set('Location', '/inventory/' + id)
    ctx.body = { id }
    ctx.status = 204
  },
  async deactivate(ctx: any, id: string) {
    await Dispatcher.dispatch(Inventory.Deactivate(id, ctx.request.body.reason))
    ctx.set('Location', '/inventory/' + id)
    ctx.body = { id }
    ctx.status = 204
  },

  // Reads
  async listInventory(ctx: any) {
    const count = await db
      .query('select count(id) from inventory')
      .then(r => r.rows[0].count)
    const result = await db.query(
      'select * from inventory limit 20 offset $1::int',
      [ctx.query.offset || 0]
    )
    ctx.body = {
      count,
      items: result.rows
    }
    ctx.status = 200
  }
}

app.use(R.post('/inventory', controller.createItem))
app.use(R.post('/inventory/:id/rename', controller.renameItem))
app.use(R.post('/inventory/:id/checkin', controller.checkIn))
app.use(R.post('/inventory/:id/remove', controller.remove))
app.use(R.post('/inventory/:id/deactivate', controller.deactivate))

app.use(R.get('/inventory', controller.listInventory))

const server = app.listen(1337, () => {
  logger.info('Server started')
})

gracefulShutdown(server, {
  finally: () => logger.info('Shutting down..'),
  // This bit will drain writes before shutting down.
  onShutdown: () => store.dispose()
})
