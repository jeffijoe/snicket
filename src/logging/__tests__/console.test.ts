import { createConsoleLogger } from '../console'

test('calls the proper method', () => {
  const con = {
    log: jest.fn()
  }
  const logger = createConsoleLogger('trace', con)

  logger.trace('Hello', 'world')
  logger.debug('Hello', 'world')
  logger.warn('Hello', 'world')
  logger.error('Hello', 'world')

  expect(con.log).toHaveBeenCalledWith(
    expect.stringContaining('🕵️‍'),
    'Hello',
    'world'
  )
  expect(con.log).toHaveBeenCalledWith(
    expect.stringContaining('🐞'),
    'Hello',
    'world'
  )
  expect(con.log).toHaveBeenCalledWith(
    expect.stringContaining('⚠️'),
    'Hello',
    'world'
  )
  expect(con.log).toHaveBeenCalledWith(
    expect.stringContaining('🚨'),
    'Hello',
    'world'
  )
})

test('respects log level', () => {
  const con = {
    log: jest.fn()
  }
  const logger = createConsoleLogger(undefined, con)

  logger.trace('Hello', 'world')
  logger.debug('Hello', 'world')
  logger.warn('Hello', 'world')
  logger.error('Hello', 'world')

  expect(con.log).toHaveBeenCalledTimes(1)
  expect(con.log).toHaveBeenCalledWith(
    expect.stringContaining('🚨'),
    'Hello',
    'world'
  )
})

test('fails if log level is invalid', () => {
  expect(() =>
    createConsoleLogger('rofl' as any)
  ).toThrowErrorMatchingInlineSnapshot(`"Unknown log level \\"rofl\\""`)
})
