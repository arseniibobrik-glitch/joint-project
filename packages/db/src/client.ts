import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? 'notion',
  password: process.env.DB_PASSWORD ?? 'notion',
  database: process.env.DB_NAME ?? 'notion_base',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

export const db = drizzle(pool, { schema, logger: process.env.NODE_ENV === 'development' })

export type DB = typeof db

pool.on('error', (err) => {
  console.error('Unexpected PG pool error', err)
})

export async function closePool() {
  await pool.end()
}