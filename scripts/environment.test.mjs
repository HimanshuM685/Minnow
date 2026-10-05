import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configurationProblems, resolveEnvironment, updateEnvText } from './environment.mjs';
import { parseEnv } from 'node:util';

test('root settings fill web, generating missing cookie secret and admin key once', () => {
  let generated = 0;
  const result = resolveEnvironment({ DATABASE_URL: 'postgresql://db', NEON_AUTH_BASE_URL: 'https://auth.example.com/auth', OBSERVATORY_ADMIN_EMAILS: 'ada@example.com', TINYFISH_API_KEY: 'fixture-key' }, { NEON_AUTH_COOKIE_SECRET: '' }, {}, () => { generated++; return 'a'.repeat(43); }, () => 'key-fixture');
  assert.equal(generated, 1);
  assert.equal(result.web.NEON_AUTH_COOKIE_SECRET, 'a'.repeat(43));
  assert.equal(result.web.ADMIN_ACCESS_KEY, 'key-fixture');
  assert.equal(result.web.TINYFISH_API_KEY, 'fixture-key');
  assert.deepEqual(configurationProblems('web', result.web), []);
  assert.equal(resolveEnvironment({}, result.web, {}, () => { throw new Error('Unexpected secret rotation'); }, () => { throw new Error('Unexpected key rotation'); }).web.ADMIN_ACCESS_KEY, 'key-fixture');
});

test('configured app-local values survive root changes, including the admin key', () => {
  const secret = 'a'.repeat(43);
  const result = resolveEnvironment({ NEON_AUTH_BASE_URL: 'https://root.example.com', ADMIN_ACCESS_KEY: 'root-key' }, { NEON_AUTH_BASE_URL: 'https://local.example.com', NEON_AUTH_COOKIE_SECRET: secret, ADMIN_ACCESS_KEY: 'local-key' });
  assert.equal(result.web.NEON_AUTH_BASE_URL, 'https://local.example.com');
  assert.equal(result.web.ADMIN_ACCESS_KEY, 'local-key');
  assert.equal(result.web.NEON_AUTH_COOKIE_SECRET, secret);
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
  assert.ok(configurationProblems('web', {}).includes('OBSERVATORY_ADMIN_EMAILS is missing'));
  assert.ok(configurationProblems('web', {}).includes('ADMIN_ACCESS_KEY is missing'));
  assert.ok(configurationProblems('web', { NEON_AUTH_COOKIE_SECRET: 'short' }).some(issue => issue.includes('32 characters')));
});
