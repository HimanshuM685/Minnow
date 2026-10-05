import { ensureSchema } from '../src/schema';

// Optional: the app applies the same schema automatically on first use.
await ensureSchema();
console.log('Minnow database schema is up to date.');
