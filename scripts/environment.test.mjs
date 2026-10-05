import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configurationProblems, resolveEnvironment, updateEnvText } from './environment.mjs';
import { parseEnv } from 'node:util';

test('root settings fill both apps, with one generated cookie secret and a web-only TinyFish key', () => {
  let generated = 0;
  const result = resolveEnvironment({ DATABASE_URL: 'postgresql://db', NEON_AUTH_BASE_URL: 'https://auth.example.com/auth', OBSERVATORY_ADMIN_EMAILS: 'ada@example.com', TINYFISH_API_KEY: 'fixture-key' }, { NEON_AUTH_COOKIE_SECRET: '' }, { NEON_AUTH_COOKIE_SECRET: '', TINYFISH_API_KEY: 'misplaced-key' }, {}, () => { generated++; return 'a'.repeat(43); });
  assert.equal(generated, 1);
  assert.equal(result.web.NEON_AUTH_COOKIE_SECRET, result.observatory.NEON_AUTH_COOKIE_SECRET);
  assert.equal(result.web.TINYFISH_API_KEY, 'fixture-key');
  assert.equal('TINYFISH_API_KEY' in result.observatory, false);
  assert.deepEqual(configurationProblems('web', result.web), []);
  assert.deepEqual(configurationProblems('observatory', result.observatory), []);
});

test('configured app-local values survive and conflicts are explicit', () => {
  const secret = 'a'.repeat(43);
  const result = resolveEnvironment({ NEON_AUTH_BASE_URL: 'https://root.example.com' }, { NEON_AUTH_BASE_URL: 'https://local.example.com', NEON_AUTH_COOKIE_SECRET: secret }, { NEON_AUTH_COOKIE_SECRET: secret });
  assert.equal(result.web.NEON_AUTH_BASE_URL, 'https://local.example.com');
  assert.equal(result.observatory.NEON_AUTH_BASE_URL, 'https://local.example.com');
  assert.deepEqual(result.conflicts, []);
  assert.ok(resolveEnvironment({}, { DATABASE_URL: 'postgresql://a' }, { DATABASE_URL: 'postgresql://b' }).conflicts.length);
});

test('updates preserve comments and unrelated settings without substituting dollar characters', () => {
  const source = '# Existing settings\nNEON_AUTH_COOKIE_SECRET=\nUNRELATED=keep\nTINYFISH_API_KEY=misplaced\n';
  const text = updateEnvText(source, { NEON_AUTH_COOKIE_SECRET: 'valid-secret-with-$&-and-32-characters', DATABASE_URL: 'postgresql://new' }, ['TINYFISH_API_KEY']);
  assert.ok(text.includes('# Existing settings'));
  const parsed = parseEnv(text);
  assert.equal(parsed.UNRELATED, 'keep');
  assert.equal(parsed.NEON_AUTH_COOKIE_SECRET, 'valid-secret-with-$&-and-32-characters');
  assert.equal(parsed.TINYFISH_API_KEY, undefined);
});

test('configuration errors identify required values and secret length', () => {
  assert.ok(configurationProblems('observatory', {}).includes('OBSERVATORY_ADMIN_EMAILS is missing'));
  assert.ok(configurationProblems('web', { NEON_AUTH_COOKIE_SECRET: 'short' }).some(issue => issue.includes('32 characters')));
});
