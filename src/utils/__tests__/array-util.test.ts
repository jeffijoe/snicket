import { uniq } from '../array-util'

test('uniq', () => {
  expect(uniq([1, 2, 2, 3, 2, 4, 5])).toEqual([1, 2, 3, 4, 5])
})
