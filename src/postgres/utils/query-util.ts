/**
 * Replaces __schema__ in the specified string with the actual schema name.
 *
 * @param str
 */
export function replaceSchema(str: string, schema?: string) {
  return str.replace(/__schema__/g, schema || 'public')
}
