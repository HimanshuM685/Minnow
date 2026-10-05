import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdminEmail, hasGoogleAccount } from '../src/access';
test('admin allowlist is case-insensitive, exact, and closed when empty',()=>{
  assert.equal(isAdminEmail('ADA@example.com',' ada@example.com, grace@example.com '),true);
  assert.equal(isAdminEmail('attacker@ada@example.com','ada@example.com'),false);
  assert.equal(isAdminEmail('ada@example.com.evil','ada@example.com'),false);
  assert.equal(isAdminEmail('ada@example.com',''),false);
});

test('settings distinguish a connected Google account from email credentials',()=>{
  assert.equal(hasGoogleAccount([{providerId:'credential'}]),false);
  assert.equal(hasGoogleAccount([{providerId:'google'}]),true);
  assert.equal(hasGoogleAccount([{providerId:'credential'},{providerId:'google'}]),true);
  assert.equal(hasGoogleAccount(null),false);
  assert.equal(hasGoogleAccount({providerId:'google'}),false);
});
