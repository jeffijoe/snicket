/**
 * Returns unique items in an array.
 * @param src
 */
export function uniq<T>(src: Array<T>): Array<T> {
  const seen = new Set()
  const len = src.length
  const result = [] as Array<T>
  for (let i = 0; i < len; i++) {
    const item = src[i]
    if (!seen.has(item)) {
      seen.add(item)
      result.push(item)
    }
  }
  return result
}
