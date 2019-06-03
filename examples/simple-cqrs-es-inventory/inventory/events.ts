// The Events
export type InventoryItemEvent =
  | InventoryItemCreated
  | InventoryItemRenamed
  | ItemsRemovedFromInventory
  | ItemsCheckedInToInventory
  | InventoryItemDeactivated

export interface InventoryItemCreated {
  type: 'InventoryItemCreated'
  id: string
  name: string
}
export interface InventoryItemRenamed {
  type: 'InventoryItemRenamed'
  id: string
  newName: string
}
export interface ItemsRemovedFromInventory {
  type: 'ItemsRemovedFromInventory'
  id: string
  count: number
}
export interface ItemsCheckedInToInventory {
  type: 'ItemsCheckedInToInventory'
  id: string
  count: number
}
export interface InventoryItemDeactivated {
  type: 'InventoryItemDeactivated'
  id: string
  reason: string
}
