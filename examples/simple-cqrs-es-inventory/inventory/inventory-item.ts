import * as Events from './events'
import * as Commands from './commands'

// The State
export interface InventoryItem {
  id: string
  activated: boolean
  itemCount: number
}

export const initialState: InventoryItem = {
  id: '',
  activated: false,
  itemCount: 0
}

// The left-fold
export function evolve(
  state: InventoryItem = initialState,
  event: Events.InventoryItemEvent
): InventoryItem {
  switch (event.type) {
    case 'InventoryItemCreated':
      return {
        ...state,
        id: event.id,
        activated: true
      }
    case 'ItemsCheckedInToInventory':
      return {
        ...state,
        itemCount: state.itemCount + event.count
      }
    case 'ItemsRemovedFromInventory':
      return {
        ...state,
        itemCount: state.itemCount - event.count
      }
    case 'InventoryItemDeactivated':
      return {
        ...state,
        activated: false
      }
  }
  return state
}

// The behavior
export function create(
  cmd: Commands.CreateInventoryItem
): Array<Events.InventoryItemEvent> {
  return [
    {
      type: 'InventoryItemCreated',
      id: cmd.id,
      name: cmd.name
    }
  ]
}
export function rename(
  cmd: Commands.RenameItem
): Array<Events.InventoryItemEvent> {
  return [
    {
      type: 'InventoryItemRenamed',
      id: cmd.id,
      newName: cmd.name
    }
  ]
}
export function checkIn(
  cmd: Commands.CheckIn
): Array<Events.InventoryItemEvent> {
  if (cmd.count <= 0) {
    throw new Error('cant remove negative count from inventory')
  }
  return [
    {
      id: cmd.id,
      type: 'ItemsCheckedInToInventory',
      count: cmd.count
    }
  ]
}
export function remove(
  cmd: Commands.Remove,
  item: InventoryItem
): Array<Events.InventoryItemEvent> {
  if (cmd.count <= 0) {
    throw new Error('cant remove negative count from inventory')
  }
  if (item.itemCount - cmd.count < 0) {
    throw new Error('count cannot go below 0')
  }
  return [
    {
      id: cmd.id,
      type: 'ItemsRemovedFromInventory',
      count: cmd.count
    }
  ]
}
export function deactivate(
  cmd: Commands.Deactivate,
  item: InventoryItem
): Array<Events.InventoryItemEvent> {
  if (!item.activated) {
    throw new Error('already deactivated')
  }

  return [
    {
      id: cmd.id,
      type: 'InventoryItemDeactivated',
      reason: cmd.reason
    }
  ]
}
