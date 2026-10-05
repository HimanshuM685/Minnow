import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oauthError, oauthMessage } from '../lib/auth/errors';
import { validAdminKey, adminDestination, adminHref, signAdminToken, verifyAdminToken } from '../lib/auth/admin-token';

const config = { key: 'fixture-key-with-$&-characters', secret: 'test-cookie-secret-'.repeat(3) };
test('OAuth errors preserve the linking reason even with the legacy duplicate marker', () => {
  assert.equal(oauthError(['google', 'account_not_linked']), 'account_not_linked');
  assert.equal(oauthError(['account_not_linked', 'google']), 'account_not_linked');
  assert.match(oauthMessage(oauthError(['google', 'account_not_linked'])), /email and password.*connect Google/);
  assert.match(oauthMessage('access_denied'), /cancelled/);
});
test('admin keys fail closed and must occur exactly once', () => {
  assert.equal(validAdminKey(new URLSearchParams({ key: config.key }), config), true);
  for (const value of ['', 'key=', 'key=wrong', `key=wrong&key=${encodeURIComponent(config.key)}`, `key=${encodeURIComponent(config.key)}&key=${encodeURIComponent(config.key)}`]) assert.equal(validAdminKey(new URLSearchParams(value), config), false);
  assert.equal(validAdminKey(new URLSearchParams('key='), { ...config, key: '' }), false);
  assert.equal(validAdminKey(new URLSearchParams({ key: config.key }), { ...config, secret: undefined }), false);
});
test('admin continuations are internal, expire, are purpose-bound, and invalidate on key rotation', () => {
  const now = 1000;
  const path = '/admin/listings?page=2&company=Acme';
  const token = signAdminToken(`${path}&key=secret&neon_auth_session_verifier=private&_rsc=abc`, 'login', config, now);
  assert.equal(verifyAdminToken(token, 'login', config, now), path);
  assert.equal(verifyAdminToken(token, 'request', config, now), null);
  assert.equal(verifyAdminToken(`${token}x`, 'login', config, now), null);
  assert.equal(verifyAdminToken(token, 'login', config, now + 600_000), null);
  assert.equal(verifyAdminToken(token, 'login', { ...config, key: 'rotated' }, now), null);
  assert.equal(verifyAdminToken(token, 'login', { ...config, secret: 'other-secret-'.repeat(4) }, now), null);
  for (const destination of ['https://evil.example/admin', '//evil.example/admin', '/app', '/administrator', '/admin/../../app', '/admin/%2f%2fevil.example', '/admin\\evil']) assert.equal(adminDestination(destination), null);
  const href = new URL(adminHref(path, config), 'https://minnow.test');
  assert.equal(href.searchParams.get('key'), config.key);
  assert.equal(href.searchParams.get('page'), '2');
  assert.equal(href.searchParams.get('company'), 'Acme');
});
