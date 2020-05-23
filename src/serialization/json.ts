import { MessageDataSerializer } from '../types/serialization'

/**
 * Options for the JSON serializer.
 */
export interface JsonSerializerOptions {
  /**
   * If `true`, revises ISO-8601 dates to `Date` instances.
   */
  reviveDates?: boolean
}

/**
 * Default JSON serializer.
 */
export const jsonSerializer = createJsonSerializer()

/**
 * Creates a JSON serializer.
 *
 * @param opts
 */
export function createJsonSerializer(
  opts: JsonSerializerOptions = {}
): MessageDataSerializer {
  const reviver = opts.reviveDates ? dateReviver : undefined
  return {
    serialize(data) {
      return JSON.stringify(data)
    },
    deserialize(str) {
      return JSON.parse(str, reviver)
    },
  }
}

/**
 * Regex for ISO-8601 date formats.
 */
const ISO8601 = /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/

/**
 * Revives dates.
 *
 * @param key
 * @param value
 */
function dateReviver(_key: string, value: unknown) {
  if (typeof value === 'string' && ISO8601.test(value)) {
    return new Date(value)
  }

  return value
}
