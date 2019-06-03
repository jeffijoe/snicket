import { MakeErrorClass } from 'fejl'

/**
 * Thrown when a concurrency error occurs in the store.
 */
export class ConcurrencyError extends MakeErrorClass(
  'The expected version did not match that of the store.'
) {}

/**
 * Thrown when a concurrency error occurs in the store.
 */
export class DuplicateMessageError extends MakeErrorClass() {
  constructor(public id: string) {
    super(`Cannot insert message with duplicate ID "${id}"`)
  }
}

/**
 * Thrown when a resource is being/been disposed
 */
export class DisposedError extends MakeErrorClass(
  'The resource has been disposed.'
) {}

export class InvalidParameterError extends MakeErrorClass(
  'The parameter value is invalid.'
) {}
