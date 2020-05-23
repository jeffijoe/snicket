import format from 'pg-format'
import { noopLogger } from '../../logging/noop'
import { PgStreamStoreConfig } from '../types/config'
import { createPostgresPool, runInTransaction } from '../connection'
import * as queryUtil from '../utils/query-util'
import * as schemaV1 from './schema-v1'
import { Pool, PoolClient } from 'pg'

/**
 * Bootstrapper for the Postgres Stream Store.
 *
 * @param config
 */
export function createPostgresStreamStoreBootstrapper(
  config: PgStreamStoreConfig
) {
  const logger = config.logger || /* istanbul ignore next */ noopLogger
  const replaceSchema = (str: string) =>
    queryUtil.replaceSchema(str, config.pg.schema)
  return {
    /**
     * Bootstraps the Stream Store database.
     */
    bootstrap() {
      logger.trace(
        `Bootstrapping a Snicket database in ${config.pg.database} with schema name ${config.pg.schema}`
      )
      return dropDatabaseIfTest()
        .then(() => createDbIfNotExist())
        .then(() => setupPostgresSchema())
        .catch(
          /* istanbul ignore next */
          (err) => {
            logger.error(err)
            throw err
          }
        )
    },

    /**
     * Gets the Snicket PG schema version.
     */
    getSchemaInfo() {
      const pool = createPostgresPool(config.pg)
      return getSchemaInfo(pool)
    },

    /**
     * Tears down the database schema.
     */
    teardown() {
      return dropPostgresSchema()
    },
  }

  /**
   * Creates a database if it does not exist
   *
   * @param db Database name.
   * @param user Database user to create.
   */
  /* istanbul ignore next */
  async function createDbIfNotExist() {
    const { database: db } = config.pg
    const pool = createPostgresPool({
      ...config.pg,
      database: 'postgres',
    })
    try {
      logger.trace(
        `Attempting to create the database if it doesn't already exist.`
      )
      await pool
        .query(format(`CREATE DATABASE %I`, db))
        .then(() => logger.trace('Database created.'))
        .catch(ignoreErrorIfExists)
    } finally {
      await pool.end()
    }
  }

  /**
   * Sets up the Postgres schema.
   */
  async function setupPostgresSchema() {
    logger.trace('Setting up the tables, indexes and types.')
    const pool = createPostgresPool(config.pg)
    try {
      const { version } = await getSchemaInfo(pool)
      if (version === 0) {
        logger.trace('Setting up Snicket PG schema v1')
        await runInTransaction(pool, (trx) =>
          trx.query(replaceSchema(schemaV1.SETUP_SQL))
        ).catch(ignoreErrorIfExists)
      } else {
        logger.trace('Schema already set up at version ' + version)
      }
    } finally {
      await pool.end()
    }
  }

  /**
   * Drops the database if it's a test database and we're in test mode.
   */
  /* istanbul ignore next */
  async function dropDatabaseIfTest() {
    const db = config.pg.database
    if (
      !config.pg.dropIfTest ||
      !db.endsWith('_test') ||
      process.env.NODE_ENV !== 'test'
    ) {
      return
    }

    const pool = createPostgresPool({
      ...config.pg,
      database: 'postgres',
    })
    try {
      const CLOSE_CONNS_SQL = format(
        `SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = %L AND pid <> pg_backend_pid()`,
        db
      )

      // Disconnect clients
      await pool.query(CLOSE_CONNS_SQL)

      await pool.query(format('drop database %I', db)).catch((err: Error) => {
        if (err.message.includes('does not exist')) {
          return
        }
        throw err
      })

      logger.debug(`Dropped database ${db} because drop: true`)
    } finally {
      await pool.end()
    }
  }

  /**
   * Drops the Postgres schema.
   */
  async function dropPostgresSchema() {
    const pool = createPostgresPool(config.pg)
    logger.trace('Dropping the tables, indexes and types.')
    try {
      await runInTransaction(pool, (trx) => {
        const sql = replaceSchema(schemaV1.TEARDOWN_SQL)
        return trx.query(sql)
      }).catch(ignoreErrorIfNotExists)
    } finally {
      await pool.end()
    }
  }

  /**
   * Gets schema info.
   *
   * @param client
   */
  function getSchemaInfo(client: Pool | PoolClient) {
    return client
      .query(
        replaceSchema(
          `SELECT obj_description('__schema__'::regnamespace, 'pg_namespace') as comment`
        )
      )
      .catch(ignoreErrorIfNotExists)
      .then((result) => {
        if (!result || result.rows.length !== 1) return { version: 0 }
        const parsed = JSON.parse(result.rows[0].comment)
        return {
          version: parsed.snicket_pg_version as number,
        }
      })
  }

  /**
   * If the error is a "already exists" error, just ignore it.
   *
   * @param err
   */
  /* istanbul ignore next */
  function ignoreErrorIfExists(err: Error) {
    if (err.message.indexOf('already exists') > -1) {
      return
    }
    throw err
  }

  /**
   * If the error is a "does not exist" error, just ignore it.
   *
   * @param err
   */
  /* istanbul ignore next */
  function ignoreErrorIfNotExists(err: Error) {
    if (err.message.indexOf('does not exist') > -1) {
      return
    }
    throw err
  }
}
