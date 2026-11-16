import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const PASSWORD = 'correct horse battery';
const IDEA = 'A launch site for a coffee roaster’s spring harvest, warm and slow';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function signUpThroughUi(page: Page, name: string, email: string) {
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  // staging: no email provider, so the confirmation link is shown, clearly labelled
  await expect(page.getByText('Staging · email delivery is not configured')).toBeVisible();
  await page.getByRole('link', { name: `Confirm ${email}` }).click();
}

async function signOut(page: Page) {
  await page.goto('/?tier=still#account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.locator('#hero-title')).toBeAttached(); // back on the story
}

test.describe.configure({ mode: 'serial' });

test('the cinematic story still renders and hands the idea to the app', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?tier=still');
  await expect(page.locator('#hero-title')).toContainText('From a single idea');
  await expect(page.getByRole('heading', { name: /Your universe starts/ })).toBeAttached();
  for (const id of ['spark', 'evolution', 'showcase', 'architecture', 'platform', 'portal', 'launch-story']) await expect(page.locator(`#${id}`)).toBeAttached();
  expect(errors).toEqual([]);
});

test('visitor → idea → registration → workspace → Muse → approval → versions → asset → launch → publish', async ({ page, request }) => {
  const email = `e2e-${Date.now().toString(36)}@example.test`;

  // 1. idea first: a visitor explores before any account exists
  await page.goto('/?tier=still#start');
  await page.getByLabel('Describe your idea').fill(IDEA);
  await page.getByRole('button', { name: 'Show me directions' }).click();
  await expect(page.getByText('Development fallback')).toBeVisible(); // never passed off as AI
  const directions = page.locator('button[aria-pressed]');
  await expect(directions).toHaveCount(3);
  await directions.first().click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Project name').fill('Halden Spring');
  await page.getByRole('button', { name: 'Continue to create account' }).click();

  // 2. account second: the idea survives registration and email confirmation
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(page.getByText('Halden Spring')).toBeVisible();
  await signUpThroughUi(page, 'Ada Tester', email);
  await page.waitForURL(/#project-[0-9a-f-]{36}$/, { timeout: 60_000 });
  const projectId = page.url().split('#project-')[1];
  await expect(page.getByText('Halden Spring').first()).toBeVisible();

  // 3. persistence: a reload reads the project back from the database
  await page.reload();
  await expect(page.getByText('Halden Spring').first()).toBeVisible();
  const before = await (await page.request.get(`/api/projects/${projectId}`)).json();
  expect(before.project.name).toBe('Halden Spring');

  // 4. Muse proposes; nothing changes until a person accepts
  await page.getByRole('button', { name: /^Muse/ }).first().click();
  await page.getByLabel('Ask Muse').fill('Make the hero bolder');
  await page.getByRole('button', { name: 'Send to Muse' }).click();
  await expect(page.getByText('Development fallback · not an AI response')).toBeVisible();
  const accept = page.getByRole('complementary', { name: 'Muse' }).getByRole('button', { name: 'Accept', exact: true });
  await expect(accept.first()).toBeVisible();
  const proposed = await accept.count();
  expect(proposed).toBeGreaterThan(0);
  const untouched = await (await page.request.get(`/api/projects/${projectId}`)).json();
  expect(untouched.project.doc).toEqual(before.project.doc);
  expect(untouched.project.revision).toBe(before.project.revision);

  await accept.first().click();
  await expect(page.getByText(/Saved as a new version/)).toBeVisible();
  const after = await (await page.request.get(`/api/projects/${projectId}`)).json();
  expect(after.project.revision).toBeGreaterThan(before.project.revision);
  if (proposed > 1) {
    await page.getByRole('complementary', { name: 'Muse' }).getByRole('button', { name: 'Reject', exact: true }).first().click();
    await expect(page.getByText(/Kept your version/)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Close Muse' }).click();

  // 5. the accepted change is a version, and an earlier version can be restored without losing the current one
  await page.getByRole('radio', { name: 'History' }).click();
  const history = page.getByRole('list', { name: 'Version history' });
  await expect(history.getByText('Muse', { exact: true })).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await history.getByRole('button', { name: 'Restore' }).last().click();
  await expect(page.getByText(/Restored\. Saved as version/)).toBeVisible();
  const restored = await (await page.request.get(`/api/projects/${projectId}`)).json();
  expect(restored.project.doc).toEqual(before.project.doc);
  const versions = await (await page.request.get(`/api/projects/${projectId}/versions`)).json();
  expect(versions.versions.map((v: { kind: string }) => v.kind)).toEqual(expect.arrayContaining(['create', 'muse', 'restore']));

  // 6. a real file upload, stored privately and previewed through the API
  await page.goto('/#library');
  const file = '/tmp/aether-e2e-pixel.png';
  writeFileSync(file, PNG);
  await page.getByLabel('Upload files').setInputFiles(file);
  await expect(page.getByText('Uploaded aether-e2e-pixel.png')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /aether-e2e-pixel\.png/ }).click();
  const img = page.getByRole('dialog', { name: 'aether-e2e-pixel.png' }).locator('img').first();
  await expect.poll(async () => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  const boot = await (await page.request.get('/api/me')).json();
  const assets = (await (await page.request.get(`/api/workspaces/${boot.workspaces[0].id}/bootstrap`)).json()).assets;
  expect(assets).toHaveLength(1);
  // the same file is not readable without the session
  expect((await request.get(assets[0].url)).status()).toBe(401);
  await page.keyboard.press('Escape');

  // 7. launch: server checks, then a publish that is only "live" once the public URL serves the build
  await page.goto(`/#launch-${projectId}`);
  await expect(page.getByText('Reduced motion alternative')).toBeVisible();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText('Halden Spring is live.')).toBeVisible({ timeout: 30_000 });
  const live = await (await page.request.get(`/api/projects/${projectId}`)).json();
  const url: string = live.project.published.url;
  expect(url).toContain('/p/');
  const pub = await request.get(url); // anonymous visitor
  expect(pub.status()).toBe(200);
  expect(await pub.text()).toContain(before.project.doc.headline.split('\n')[0]);
  expect(pub.headers()['content-security-policy']).toContain("default-src 'none'");
  await page.getByRole('button', { name: 'Close' }).first().click().catch(() => undefined);
  await page.keyboard.press('Escape');

  // unpublish really takes the page down
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Unpublish' }).click();
  await expect(page.getByText(/Unpublished\./)).toBeVisible();
  expect((await request.get(url)).status()).toBe(404);

  // 8. sessions end, and protected routes ask for sign-in again
  await signOut(page);
  await page.goto(`/#project-${projectId}`);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  expect((await page.request.get(`/api/projects/${projectId}`)).status()).toBe(401);

  // 9. another account cannot see the first account's project, by URL or by API
  await page.goto('/#signup');
  await signUpThroughUi(page, 'Bo Other', `e2e-other-${Date.now().toString(36)}@example.test`);
  await page.waitForURL(/#workspace$/);
  await expect(page.getByText('No projects yet').first()).toBeVisible();
  expect((await page.request.get(`/api/projects/${projectId}`)).status()).toBe(404);
  await page.goto(`/#project-${projectId}`);
  await expect(page.getByText('This project isn’t here')).toBeVisible();

  // 10. the first account signs back in and everything is still there
  await signOut(page);
  await page.goto('/#signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/#workspace$/);
  await expect(page.getByText('Halden Spring').first()).toBeVisible();
});
