import { MakeErrorClass } from 'fejl'

/**
 * Thrown when a wrong expected version error occurs in the store.
 */
export class WrongExpectedVersionError extends MakeErrorClass(
  'The expected version did not match that of the store.'
) {}

/**
 * Thrown when a resource is being/been disposed
 */
export class DisposedError extends MakeErrorClass(
  'The resource has been disposed.'
) {}

export class InvalidParameterError extends MakeErrorClass(
  'The parameter value is invalid.'
) {}
