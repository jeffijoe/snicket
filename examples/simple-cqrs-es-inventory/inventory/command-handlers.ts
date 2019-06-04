import {
  StreamStore,
  ExpectedVersion,
  NewStreamMessage,
  ConcurrencyError
} from 'snicket'
import * as Inventory from './'
import { readStreamToEnd, toStreamId } from '../infra/util'
import uuid from 'uuid'

export function makeCreateInventoryItemHandler(store: StreamStore) {
  return async function handleCreateInventoryItem(
    cmd: Inventory.CreateInventoryItem
  ) {
    // Retries the whole block on concurrency errors.
    return ConcurrencyError.retry(async () => {
      const { state: existing } = await load(store, cmd.id)
      if (existing) throw new Error('item already exists')
      const newEvents = Inventory.create(cmd)
      await save(store, cmd.id, ExpectedVersion.Empty, newEvents)
    })
  }
}

export function makeRenameItemHandler(store: StreamStore) {
  return async function handleRenameItem(cmd: Inventory.RenameItem) {
    // Retries the whole block on concurrency errors.
    return ConcurrencyError.retry(async () => {
      const { state: existing, version } = await load(store, cmd.id)
      if (!existing) throw new Error('item does not exist')
      const newEvents = Inventory.rename(cmd)
      await save(store, cmd.id, version, newEvents)
    })
  }
}

export function makeCheckInHandler(store: StreamStore) {
  return async function handleCheckIn(cmd: Inventory.CheckIn) {
    // Retries the whole block on concurrency errors.
    return ConcurrencyError.retry(async () => {
      const { state: existing, version } = await load(store, cmd.id)
      if (!existing) throw new Error('item does not exist')
      const newEvents = Inventory.checkIn(cmd)
      await save(store, cmd.id, version, newEvents)
    })
  }
}

export function makeRemoveHandler(store: StreamStore) {
  return async function handleRemove(cmd: Inventory.Remove) {
    // Retries the whole block on concurrency errors.
    return ConcurrencyError.retry(async () => {
      const { state: existing, version } = await load(store, cmd.id)
      if (!existing) throw new Error('item does not exist')
      const newEvents = Inventory.remove(cmd, existing)
      await save(store, cmd.id, version, newEvents)
    })
  }
}

export function makeDeactivateHandler(store: StreamStore) {
  return async function handleDeactivate(cmd: Inventory.Deactivate) {
    // Retries the whole block on concurrency errors.
    return ConcurrencyError.retry(async () => {
      const { state: existing, version } = await load(store, cmd.id)
      if (!existing) throw new Error('item does not exist')
      const newEvents = Inventory.deactivate(cmd, existing)
      await save(store, cmd.id, version, newEvents)
    })
  }
}

// Utilities. Should really be a repository.
async function load(store: StreamStore, itemId: string) {
  const { messages, version } = await readStreamToEnd(
    store,
    toStreamId('InventoryItem', itemId)
  )
  if (messages.length === 0) {
    return { state: null, version }
  }
  return {
    state: messages.map(m => m.data).reduce(Inventory.evolve, undefined),
    version
  }
}

async function save(
  store: StreamStore,
  id: string,
  expectedVersion: number,
  newEvents: Array<Inventory.InventoryItemEvent>
) {
  const appendResult = await store.appendToStream(
    toStreamId('InventoryItem', id),
    expectedVersion,
    newEvents.map(
      e =>
        ({
          messageId: uuid.v4(),
          data: e,
          type: e.type
        } as NewStreamMessage)
    )
  )
  return appendResult.streamVersion
}
