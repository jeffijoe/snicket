import { Pool, PoolClient } from 'pg'
import { DatabaseConnectionOptions } from './types/config'

/**
 * Creates a Postgres connection pool.
 */
export function createPostgresPool({
  host,
  port,
  ssl,
  user,
  password,
  database
}: DatabaseConnectionOptions) {
  return new Pool({
    password,
    database,
    host,
    port,
    ssl,
    user,
    min: 0,
    idleTimeoutMillis: 2 * 60 * 1000,
    max: 10
  })
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
