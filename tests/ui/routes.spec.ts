import { expect,test } from '@playwright/test';

test('landing is public, sample is labelled, auth UI is owned, and app routes are protected', async ({page},testInfo) => {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Find your next current.'})).toBeVisible();
  await expect(page.getByText('Illustrative sample · not live')).toBeVisible();
  await expect(page.getByRole('link',{name:'Apply',exact:true})).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath('landing.png'),fullPage:true});
  await page.getByRole('link',{name:'Start your hunt'}).click();
  await expect(page.getByRole('button',{name:'Create account'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Continue with Google'})).toHaveCount(0);
  await page.goto('/app/listings');
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  await expect(page.getByRole('heading',{name:'Welcome back.'})).toBeVisible();
  await page.getByLabel('Email',{exact:true}).fill('test@example.com');
  await page.getByLabel('Password',{exact:true}).fill('test-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.locator('.auth-card [role=alert]')).toContainText('NEON_AUTH_BASE_URL');
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

test('Observatory is separate, protected, and has operator sign-in without sign-up', async ({page},testInfo) => {
  await page.goto('http://localhost:3001/hunts');
  await expect(page).toHaveURL(/3001\/auth\/sign-in/);
  await expect(page.getByRole('heading',{name:'Operator sign-in'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Create account'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:testInfo.outputPath('observatory-auth.png'),fullPage:true});
});
