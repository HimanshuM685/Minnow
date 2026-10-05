import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdminEmail, hasGoogleAccount, authIntent, appOrigin, observatoryGoogleEntry } from '../src/access';
test('admin allowlist is case-insensitive, exact, and closed when empty',()=>{
  assert.equal(isAdminEmail('ADA@example.com',' ada@example.com, grace@example.com '),true);
  assert.equal(isAdminEmail('attacker@ada@example.com','ada@example.com'),false);
  assert.equal(isAdminEmail('ada@example.com.evil','ada@example.com'),false);
  assert.equal(isAdminEmail('ada@example.com',''),false);
});

test('Observatory requires a Managed Auth Google account, not just a password account',()=>{
  assert.equal(hasGoogleAccount([{providerId:'credential'}]),false);
  assert.equal(hasGoogleAccount([{providerId:'google'}]),true);
  assert.equal(hasGoogleAccount([{providerId:'credential'},{providerId:'google'}]),true);
  assert.equal(hasGoogleAccount(null),false);
  assert.equal(hasGoogleAccount({providerId:'google'}),false);
});

test('admin login intent and app origins cannot become arbitrary return URLs',()=>{
  assert.equal(authIntent('observatory'),'observatory');
  assert.equal(authIntent('https://example.com/steal'),'web');
  assert.equal(authIntent(null),'web');
  assert.equal(observatoryGoogleEntry(undefined),'http://localhost:3000/auth/sign-in?intent=observatory');
  assert.equal(observatoryGoogleEntry('https://minnow.example.com/'),'https://minnow.example.com/auth/sign-in?intent=observatory');
  assert.equal(appOrigin('https://admin.example.com/','http://localhost:3001'),'https://admin.example.com');
  for(const url of ['javascript:alert(1)','https://user:password@example.com','https://example.com/other','https://example.com/?return=bad']) assert.throws(()=>appOrigin(url,'http://localhost:3000'));
});
