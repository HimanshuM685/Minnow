import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TELEGRAM_URL, TINYFISH_SIGNUP_URL } from '../lib/links';

test('the TinyFish referral and Telegram links are exactly the provided ones', () => {
  assert.equal(TINYFISH_SIGNUP_URL, 'https://agent.tinyfish.ai/sign-up?ref=v1.dXNlcl8zSzZQbHAzRnZBYTlrbk1DNnFZckRvOXZIUnk.xH0E4hS3LLmfb4Ji8NMIynimWRSXgjr-wBNnnOcs-I0');
  assert.equal(TELEGRAM_URL, 'https://t.me/HimanshuM685');
});
