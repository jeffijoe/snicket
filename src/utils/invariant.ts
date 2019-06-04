import { InvalidParameterError } from '../errors/errors'
import validateUUID from 'uuid-validate'

/**
 * Ensures the specified field is given.
 *
 * @param paramName
 * @param value
 */
export function required<T>(
  paramName: string,
  value: T | null | undefined
): T | never {
  check(
    `${paramName} is required`,
    () => value !== null && value !== undefined && (value as any) !== ''
  )
  return value!
}

/**
 * Requires the value to be a string and to be defined.
 *
 * @param paramName
 * @param value
 */
export function requiredString(paramName: string, value: any): string | never {
  check(`${paramName} is required`, () => !!value)
  check(`${paramName} must be a string`, () => typeof value === 'string')
  return value
}

/**
 * Throws if the stream ID is an operational stream.
 *
 * @param paramName
 * @param streamId
 */
export function notOperationalStream(paramName: string, streamId: string) {
  return assert(
    `${paramName} must not start with a "$", as they are reserved for operational streams.`,
    !streamId.startsWith('$')
  )
}

/**
 * Runs the given check fn, throws an error with the specified message if the check returns false.
 *
 * @param message
 * @param fn
 */
export function assert(message: string, condition: any): void | never {
  if (!condition) {
    throw new InvalidParameterError(message)
  }
}

/**
 * Runs the given check fn, throws an error with the specified message if the check returns false.
 *
 * @param message
 * @param fn
 */
export function check(message: string, fn: () => boolean): void | never {
  if (!fn()) {
    throw new InvalidParameterError(message)
  }
}

/**
 * Validates that the param is a UUID.
 * Does not throw if the value is falsy (should use invariant.required first).
 *
 * @param value
 */
export function uuid(
  paramName: string,
  value?: string
): string | undefined | never {
  check(
    `${paramName} is not a valid UUID`,
    () => !value || validateUUID(value, 4)
  )
  return value
}
