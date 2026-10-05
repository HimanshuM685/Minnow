import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const sql = neon(process.env.DATABASE_URL);
const directory = new URL('../migrations/', import.meta.url);
// Migrations are idempotent, so every file runs on every migrate, in name order.
for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
  const migration = await readFile(fileURLToPath(new URL(file, directory)), 'utf8');
  await sql.transaction(migration.split(';').map(statement => statement.trim()).filter(Boolean).map(statement => sql.query(statement, [])));
  console.log(`Applied ${file}`);
}
console.log('Minnow database migration applied.');
