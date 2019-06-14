import { Pool, PoolClient, PoolConfig } from 'pg'
import { DatabaseConnectionOptions } from './types/config'

// Create type overrides for JSON so we get them out as strings.
// This lets us (de)serialize them ourselves.
const identity = (x: any) => x
const typeOverrides = new (require('pg/lib/type-overrides'))()
typeOverrides.setTypeParser(114, identity)
typeOverrides.setTypeParser(3802, identity)
typeOverrides.setTypeParser(199, identity)
typeOverrides.setTypeParser(3807, identity)

/**
 * Creates a Postgres connection pool.
 */
export function createPostgresPool({
  host,
  port,
  ssl,
  user,
  password,
  database,
  min,
  max
}: DatabaseConnectionOptions) {
  return new Pool({
    password,
    database,
    host,
    ssl,
    user,
    types: typeOverrides,
    min: min || 0,
    port: port as any,
    idleTimeoutMillis: 2 * 60 * 1000,
    max: max || 10
  } as PoolConfig)
}

/**
 * Runs the given fn in a transaction.
 * @param pool
 * @param fn
 */
export async function runInTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN;')
    const result = await fn(client)
    await client.query('COMMIT;')
    return result
  } catch (err) {
    await client.query('ROLLBACK;')
    throw err
  } finally {
    client.release()
  }
}
