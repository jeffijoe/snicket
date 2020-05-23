import { uniq, groupBy } from '../array-util'

test('uniq', () => {
  expect(uniq([1, 2, 2, 3, 2, 4, 5])).toEqual([1, 2, 3, 4, 5])
})

test('groupBy', () => {
  const items = [
    {
      group: 'one',
      value: 'one 1',
    },
    {
      group: 'one',
      value: 'one 2',
    },
    {
      group: 'two',
      value: 'two 1',
    },
  ]

  const grouped = groupBy(items, 'group')
  expect(grouped.length).toBe(2)
  expect(grouped[0][0]).toBe('one')
  expect(grouped[0][1]).toEqual([items[0], items[1]])
  expect(grouped[1][0]).toBe('two')
  expect(grouped[1][1]).toEqual([items[2]])
})
