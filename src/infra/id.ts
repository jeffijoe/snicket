import { v4, v5 } from 'uuid'

// If you copy this code, CHANGE THE NAMESPACE!
const namespace = '42d11719-ef3b-4a2c-a10f-df8f84ae73a3'

/**
 * Generates a deterministic ID. Used for operational things.
 */
export function newDeterministicUuid(value: string) {
  return v5(value, namespace)
}

/**
 * Generates a random UUID.
 */
export function newRandomUuid() {
  return v4()
}
