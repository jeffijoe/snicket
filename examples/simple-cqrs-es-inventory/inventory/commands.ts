// The commands
export type InventoryCommand =
  | CreateInventoryItem
  | RenameItem
  | CheckIn
  | Remove
  | Deactivate

export interface CreateInventoryItem {
  type: 'CreateInventoryItem'
  id: string
  name: string
}
export function CreateInventoryItem(
  id: string,
  name: string
): CreateInventoryItem {
  return { type: 'CreateInventoryItem', id, name }
}

export interface RenameItem {
  type: 'RenameItem'
  id: string
  name: string
}
export function RenameItem(id: string, name: string): RenameItem {
  return { type: 'RenameItem', id, name }
}

export interface CheckIn {
  type: 'CheckIn'
  id: string
  count: number
}
export function CheckIn(id: string, count: number): CheckIn {
  return { type: 'CheckIn', id, count }
}

export interface Remove {
  type: 'Remove'
  id: string
  count: number
}
export function Remove(id: string, count: number): Remove {
  return { type: 'Remove', id, count }
}

export interface Deactivate {
  type: 'Deactivate'
  id: string
  reason: string
}
export function Deactivate(id: string, reason: string): Deactivate {
  return { type: 'Deactivate', id, reason }
}
