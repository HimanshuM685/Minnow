import { expect,test } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { BrowserContext } from '@playwright/test';

// SDK-compatible cache fixtures signed only with the isolated browser-test secret.
// No production authentication code or database is bypassed or modified.
async function cachedSession(context: BrowserContext, email: string, method: 'google' | 'email') {
  const now = new Date().toISOString();
  const data = { session: { id: `fixture-${method}`, token: `fixture-${method}`, userId: 'fixture-user', expiresAt: new Date(Date.now() + 300_000).toISOString(), createdAt: now, updatedAt: now }, user: { id: 'fixture-user', name: 'Fixture', email, emailVerified: true, createdAt: now, updatedAt: now }, exp: Math.floor(Date.now() / 1000) + 300 };
  const payload = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(data)).toString('base64url')}`;
  const jwt = `${payload}.${createHmac('sha256', 'browser-test-only-not-a-runtime-secret').update(payload).digest('base64url')}`;
  await context.addCookies([
    { name: '__Secure-neon-auth.session_token', value: `fixture-${method}`, domain: 'localhost', path: '/', secure: true, httpOnly: true },
    { name: '__Secure-neon-auth.local.session_data', value: jwt, domain: 'localhost', path: '/', secure: true, httpOnly: true },
  ]);
}

test('landing is public, sample is labelled, auth UI is owned, and app routes are protected', async ({page},testInfo) => {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Find your next current.'})).toBeVisible();
  await expect(page.getByText('Illustrative sample · not live')).toBeVisible();
  await expect(page.getByRole('link',{name:'Apply',exact:true})).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath('landing.png'),fullPage:true});
  await page.getByRole('link',{name:'Start your hunt'}).first().click();
  await expect(page.getByRole('button',{name:'Create account'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Continue with Google'})).toBeVisible();
  await page.goto('/dashboard/listings');
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  await expect(page.getByRole('heading',{name:'Welcome to Minnow.'})).toBeVisible();
  await page.getByLabel('Email',{exact:true}).fill('test@example.com');
  await page.getByLabel('Password',{exact:true}).fill('test-password');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.locator('.email-auth-form [role=alert]')).toContainText('NEON_AUTH_BASE_URL');
  await page.getByRole('button',{name:'Continue with Google'}).click();
  await expect(page.locator('.google-auth-form [role=alert]')).toContainText('NEON_AUTH_BASE_URL');
  await page.screenshot({path:testInfo.outputPath('auth.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('unauthenticated API access cannot run hunts or download resumes', async ({request}) => {
  const hunt=await request.post('/api/hunt',{data:{refresh:true}});
  expect(hunt.status()).toBe(401);
  const resume=await request.get('/api/resume/download');
  expect(resume.status()).toBe(401);
});

test('signed-out admin redirects to the single sign-in page and returns to /admin', async ({page}) => {
  await page.goto('/admin/listings');
  await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Fadmin%2Flistings$/);
  await expect(page.getByRole('heading',{name:'Sign in to Minnow Admin.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Continue with Google'})).toBeVisible();
  await expect(page.locator('.observatory-shell')).toHaveCount(0);
});

test('sign-up route is the same page and open redirects are ignored', async ({page}) => {
  await page.goto('/auth/sign-up');
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  await page.goto('/auth/sign-in?next=https://evil.example');
  await expect(page.locator('input[name=next]').first()).toHaveValue('/dashboard');
});

test('non-allowlisted accounts get 403 on /admin; signed-in users skip the sign-in page', async ({page, context}) => {
  for (const method of ['email', 'google'] as const) {
    await cachedSession(context, 'not-admin@example.com', method);
    const denied = await page.goto('/admin/listings');
    expect(denied?.status()).toBe(403);
    await expect(page.getByRole('heading', { name: '403 · Access denied' })).toBeVisible();
    await page.goto('/auth/sign-in');
    await expect(page).toHaveURL(/\/dashboard$/);
  }
});

test('authenticated navigation displays user state, skip-link, and TinyFish link', async ({ page, context }) => {
  await page.goto('/');
  const skipLink = page.locator('.skip-link');
  await expect(skipLink).toBeAttached();
  await expect(skipLink).toHaveAttribute('href', '#main');

  // Verify unauthenticated header
  await expect(page.locator('.public-nav a[href="/auth/sign-in"]')).toBeVisible();

  // Set session and visit landing page
  await cachedSession(context, 'hunter@example.com', 'email');
  await page.goto('/');

  // Header now displays user state and sign-out button
  await expect(page.locator('.public-nav .nav-user-email')).toBeVisible();
  await expect(page.locator('.public-nav .nav-user-email')).toContainText('Fixture');
  await expect(page.locator('.public-nav .nav-signout-btn')).toBeVisible();
  await expect(page.locator('.public-nav a[href="/auth/sign-in"]')).toHaveCount(0);

  // Footer links TinyFish
  const tinyFishLink = page.locator('footer.site-footer a[href="https://tinyfish.ai"]');
  await expect(tinyFishLink).toBeVisible();
  await expect(tinyFishLink).toHaveAttribute('target', '_blank');
});


