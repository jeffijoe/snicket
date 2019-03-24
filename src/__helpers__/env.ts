import yenv from 'yenv'

export interface IEnv {
  NODE_ENV: 'development' | 'test' | 'staging' | 'production'
  PORT: number
  STREAMS_PG_SCHEMA: string
  STREAMS_PG_HOST: string
  STREAMS_PG_PORT: number
  STREAMS_PG_USER: string
  STREAMS_PG_PASS: string
  STREAMS_PG_DATABASE: string
}

process.env.NODE_ENV = process.env.NODE_ENV || 'development'

export const env = yenv<IEnv>('env.yaml', { optionalEntrypoint: true })
