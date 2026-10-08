import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const webKeys = ['NEON_AUTH_BASE_URL', 'NEON_AUTH_COOKIE_SECRET', 'DATABASE_URL', 'OBSERVATORY_ADMIN_EMAILS', 'ADMIN_ACCESS_KEY', 'NEON_AUTH_COOKIE_DOMAIN', 'TINYFISH_API_KEY', 'NEON_AUTH_GOOGLE_ENABLED', 'MAX_AGENT_RUNS', 'CRON_SECRET'];
const value = (entry) => typeof entry === 'string' ? entry.trim() : '';

// Compute a setup without overwriting existing app-local credentials.
export function resolveEnvironment(root, web, inherited = {}, generateSecret = () => randomBytes(32).toString('base64'), generateKey = () => randomBytes(32).toString('base64url')) {
  const nextWeb = { ...web };
  for (const key of webKeys) {
    let found = value(web[key]) || value(root[key]) || value(inherited[key]);
    if (key === 'NEON_AUTH_COOKIE_SECRET' && !found) found = generateSecret();
    if (key === 'ADMIN_ACCESS_KEY' && !found) found = generateKey();
    if (found) nextWeb[key] = found;
  }
  return { web: nextWeb };
}

export function configurationProblems(app, env) {
  const problems = [];
  for (const key of ['NEON_AUTH_BASE_URL', 'NEON_AUTH_COOKIE_SECRET', 'DATABASE_URL', 'ADMIN_ACCESS_KEY', 'OBSERVATORY_ADMIN_EMAILS']) {
    if (!value(env[key])) problems.push(`${key} is missing`);
  }
  if (value(env.NEON_AUTH_COOKIE_SECRET) && env.NEON_AUTH_COOKIE_SECRET.length < 32) problems.push('NEON_AUTH_COOKIE_SECRET must contain at least 32 characters');
  if (value(env.NEON_AUTH_BASE_URL)) {
    try {
      const url = new URL(env.NEON_AUTH_BASE_URL);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch { problems.push('NEON_AUTH_BASE_URL must be the full Neon Auth URL'); }
  }
  if (value(env.DATABASE_URL) && !/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL)) problems.push('DATABASE_URL must be a Postgres connection string');
  return problems;
}

export function updateEnvText(text, values, removed = []) {
  let result = text;
  for (const key of removed) result = result.replace(new RegExp(`^(?:export\\s+)?${key}\\s*=.*(?:\\r?\\n|$)`, 'gm'), '');
  const original = parseEnv(result);
  for (const [key, setting] of Object.entries(values)) {
    if (original[key] === setting || !value(setting)) continue;
    const line = `${key}=${JSON.stringify(setting)}`;
    const pattern = new RegExp(`^(?:export\\s+)?${key}\\s*=.*$`, 'm');
    result = pattern.test(result) ? result.replace(pattern, () => line) : `${result}${result.endsWith('\n') || !result ? '' : '\n'}${line}\n`;
  }
  return result;
}

async function read(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}

async function main() {
  const directory = new URL('../', import.meta.url);
  const paths = {
    root: new URL('.env', directory),
    web: new URL('apps/web/.env.local', directory),
  };
  const [rootText, webText] = await Promise.all([read(paths.root), read(paths.web)]);
  let web = parseEnv(webText);
  const root = parseEnv(rootText);

  if (process.argv.includes('--setup')) {
    const resolved = resolveEnvironment(root, web, process.env);
    const newWebText = updateEnvText(webText, resolved.web);
    if (newWebText !== webText) await writeFile(paths.web, newWebText, { mode: 0o600 });
    web = resolved.web;
    console.log('Web environment synchronized. Existing values preserved; missing cookie secret and admin key generated.');
  }

  const appArgument = process.argv.find(argument => argument.startsWith('--app='))?.slice(6);
  const apps = appArgument ? [appArgument] : ['web'];
  let missing = false;
  for (const app of apps) {
    if (app !== 'web') throw new Error('Unknown app. Use web.');
    const fileSettings = web;
    // Existing exported environment values take precedence in Next.js as well.
    const effective = { ...fileSettings };
    for (const key of webKeys) if (value(process.env[key])) effective[key] = process.env[key];
    const problems = configurationProblems(app, effective);
    const lines = [`\napps/${app}/.env.local`];
    if (problems.length) {
      missing = true;
      for (const problem of problems) lines.push(`  - ${problem}`);
    } else lines.push('  Required configuration is present.');
    console.log(lines.join('\n'));
  }
  if (missing) {
    console.error('\nGet the Auth URL from Neon Console → Project → Branch → Auth → Configuration.');
    console.error('Set DATABASE_URL and NEON_AUTH_BASE_URL in root .env or the app-local files.');
    console.error('Set OBSERVATORY_ADMIN_EMAILS to your account email, then run npm run setup:env.');
    if (!process.argv.includes('--setup') || process.argv.includes('--check')) process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`Environment setup failed: ${error.message}`); process.exitCode = 1; });
}
