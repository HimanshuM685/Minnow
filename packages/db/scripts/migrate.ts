import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const sql = neon(process.env.DATABASE_URL);
const migration = await readFile(fileURLToPath(new URL('../migrations/001_initial.sql',import.meta.url)), 'utf8');
await sql.transaction(migration.split(';').map(statement=>statement.trim()).filter(Boolean).map(statement=>sql.query(statement,[])));
console.log('Minnow database migration applied.');
