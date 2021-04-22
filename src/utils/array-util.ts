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

/**
 * Groups an array by key.
 *
 * @param src
 * @param groupingKey
 */
export function groupBy<T, K extends keyof T>(
  src: Array<T>,
  groupingKey: K
): Array<[T[K], Array<T>]> {
  const map = new Map<T[K], Array<T>>()
  for (const item of src) {
    const k = item[groupingKey]
    let entry = map.get(k)
    if (!entry) {
      entry = []
      map.set(k, entry)
    }

    entry.push(item)
  }

  return Array.from(map.entries())
}

/**
 * Generates a range of numbers from start (inclusive) to end (exclusive).
 * If only a single argument is specified, it becomes `end` and `start` becomes 0.
 *
 * @param start
 * @param end
 */
export function range(start: number, end?: number): number[] {
  if (end === undefined) {
    end = start
    start = 0
  }

  const result: number[] = []
  for (let i = start; i < end; i++) {
    result.push(i)
  }
  return result
}
