import { replaceSchema } from '../utils/query-util'

describe('replaceSchema', () => {
  test('basic', () => {
    expect(replaceSchema('__schema__.test')).toBe('snicket.test')
    expect(replaceSchema('__schema__.test.__schema__', 'rofl')).toBe(
      'rofl.test.rofl'
    )
  })
})
