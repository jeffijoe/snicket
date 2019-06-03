import { Pool } from 'pg'
import { streamStoreConfig } from '../cfg'

// Reuse the same DB for convenience.
export const db = new Pool({
  ...(streamStoreConfig.pg as any)
})

// Creates a simple read model table setup.
// One for the items and one for the checkpoint.
export async function setupReadModelSchema() {
  await db.query(`
create table if not exists inventory (
  id uuid primary key,
  name text default '',
  activated bool default false,
  deactivation_reason text default '',
  quantity_in_stock int default 0,
  _version int default 0
);

create table if not exists checkpoint (
  id text primary key,
  position bigint
);
  `)
}
