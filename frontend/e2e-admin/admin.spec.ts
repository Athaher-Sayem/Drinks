import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function login(page: Page, role = 'admin') {
  await page.goto('/admin');
  await page.getByLabel('Email address', { exact: true }).fill(`${role}@e2e.example.com`);
  await page.getByLabel('Password', { exact: true }).fill('E2e-only-passphrase-493!');
  await page.getByRole('button', { name: 'Sign in to administration' }).click();
}

test('administration requires a staff account and staff cannot edit owner settings', async ({ page }) => {
  await login(page, 'customer');
  await expect(page.getByRole('heading', { name: 'Staff access required' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Products', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByLabel('Email address', { exact: true }).fill('staff@e2e.example.com');
  await page.getByLabel('Password', { exact: true }).fill('E2e-only-passphrase-493!');
  await page.getByRole('button', { name: 'Sign in to administration' }).click();
  await expect(page.getByRole('heading', { name: 'Store overview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Store settings', exact: true })).toHaveCount(0);
});

test('owner creates categories, products, variants and changes inventory safely', async ({ page }, testInfo) => {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Store overview' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('overview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Categories', exact: true }).click();
  await page.getByRole('button', { name: 'New category' }).click();
  await page.getByLabel('Category name').fill('Desk essentials');
  await page.getByLabel('Category slug').fill('desk-essentials');
  await page.getByRole('button', { name: 'Save category' }).click();
  await expect(page.getByRole('status')).toContainText('Category saved');
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'New product' }).click();
  await page.getByLabel('Product name').fill('Linen Notebook');
  await page.getByLabel('Product slug').fill('linen-notebook');
  await page.getByLabel('Product category').selectOption({ label: 'Desk essentials' });
  await page.getByLabel('Product description').fill('A reusable admin test product.');
  await page.getByLabel('Photo URLs').fill('https://example.com/notebook.jpg');
  await page.getByLabel('Product attributes').fill('material=linen');
  await page.getByRole('button', { name: 'Save product' }).click();
  await expect(page.getByRole('heading', { name: 'Edit product' })).toBeVisible();
  await page.getByRole('button', { name: 'New variant' }).click();
  await page.getByLabel('Variant name').fill('A5');
  await page.getByLabel('SKU').fill('TEST-LINEN-A5');
  await page.getByLabel('Price').fill('14.50');
  await page.getByLabel('Initial stock').fill('8');
  await page.getByLabel('Variant options').fill('size=A5');
  await page.getByRole('button', { name: 'Save variant' }).click();
  await expect(page.getByText('TEST-LINEN-A5', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search inventory' }).fill('linen');
  await page.getByRole('button', { name: 'Adjust stock for TEST-LINEN-A5' }).click();
  await page.getByLabel('Quantity change').fill('3');
  await page.getByLabel('Adjustment reason').fill('New shipment');
  let first = true;
  const keys: string[] = [];
  await page.route('**/inventory-adjustments', async route => {
    keys.push(route.request().headers()['idempotency-key']);
    if (first) { first = false; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Apply adjustment' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Apply adjustment' }).click();
  await expect(page.getByRole('status')).toContainText('Inventory updated');
  expect(new Set(keys).size).toBe(1);
  await expect(page.getByRole('row').filter({ hasText: 'TEST-LINEN-A5' })).toContainText('11');
  await page.screenshot({ path: testInfo.outputPath('inventory.png'), fullPage: true });
});

test('owner can manage orders and store settings; layout is accessible on mobile', async ({ page }, testInfo) => {
  await login(page);
  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  await page.getByRole('button', { name: /Open order/ }).first().click();
  await expect(page.getByRole('dialog').getByText('Fixture Guest', { exact: true })).toBeVisible();
  await page.getByLabel('Next order status').selectOption('confirmed');
  await page.getByRole('button', { name: 'Update order status' }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Order status updated');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Store settings', exact: true }).click();
  await page.getByLabel('Store name').fill('Considered Market');
  await page.getByLabel('Contact email').fill('hello@example.com');
  await page.getByRole('button', { name: 'Save store settings' }).click();
  await expect(page.getByRole('status')).toContainText('Store settings saved');
  await page.setViewportSize({ width: 390, height: 844 });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, overflowing: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => ({ tag: e.tagName, class: String(e.className), width: e.getBoundingClientRect().width })) }));
  expect(dimensions.scroll, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.width);
  await page.screenshot({ path: testInfo.outputPath('settings-mobile.png'), fullPage: true });
});

test('inactive categories remain editable and hidden from the storefront', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Categories', exact: true }).click();
  await page.getByRole('button', { name: 'New category' }).click();
  await page.getByLabel('Category name').fill('Hidden collection');
  await page.getByLabel('Category slug').fill('hidden-collection');
  await page.getByLabel('Active category').uncheck();
  await page.getByRole('button', { name: 'Save category' }).click();
  const row = page.getByRole('row').filter({ hasText: 'Hidden collection' });
  await expect(row).toContainText('Inactive');
  expect((await (await page.request.get('/api/v1/categories?limit=100')).json()).items.some((c: { slug: string }) => c.slug === 'hidden-collection')).toBe(false);
  await page.getByRole('button', { name: 'Edit category Hidden collection' }).click();
  await page.getByLabel('Active category').check();
  await page.getByRole('button', { name: 'Save category' }).click();
  await expect(row).toContainText('Active');
});

test('inventory retry survives reload without applying the adjustment twice', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search inventory' }).fill('soda');
  await page.getByRole('button', { name: 'Adjust stock for DEMO-CITRUS-SODA' }).click();
  await page.getByLabel('Quantity change').fill('2');
  await page.getByLabel('Adjustment reason').fill('Reload-safe shipment');
  const keys: string[] = [];
  await page.route('**/inventory-adjustments', async route => {
    keys.push(route.request().headers()['idempotency-key']);
    if (keys.length === 1) { await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Apply adjustment' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search inventory' }).fill('soda');
  await page.getByRole('button', { name: 'Adjust stock for DEMO-CITRUS-SODA' }).click();
  await expect(page.getByLabel('Quantity change')).toHaveValue('2');
  await page.getByLabel('Adjustment reason').fill('Reload-safe shipment');
  await page.getByRole('button', { name: 'Apply adjustment' }).click();
  await expect(page.getByRole('status')).toContainText('Inventory updated');
  expect(keys).toHaveLength(2);
  expect(new Set(keys).size).toBe(1);
  await expect(page.getByRole('row').filter({ hasText: 'DEMO-CITRUS-SODA' })).toContainText('27');
});

test('session loss clears the private workspace before showing a login', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  await expect(page.getByText('Fixture Guest', { exact: true })).toBeVisible();
  const session = await (await page.request.get('/api/v1/session')).json();
  await page.request.post('/api/v1/auth/logout', { headers: { 'X-CSRF-Token': session.csrf_token } });
  await page.getByRole('button', { name: 'Categories', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in to administration' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Fixture Guest');
  await expect(page.getByRole('navigation', { name: 'Administration' })).toHaveCount(0);
});

test('focus revalidation detects a revoked session without another staff action', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  await expect(page.getByText('Fixture Guest', { exact: true })).toBeVisible();
  const session = await (await page.request.get('/api/v1/session')).json();
  await page.request.post('/api/v1/auth/logout', { headers: { 'X-CSRF-Token': session.csrf_token } });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Sign in to administration' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Fixture Guest');
});

test('logout in a second tab clears the first tab workspace', async ({ page, context }) => {
  await login(page);
  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  await expect(page.getByText('Fixture Guest', { exact: true })).toBeVisible();
  const second = await context.newPage();
  await second.goto('/admin');
  await expect(second.getByRole('heading', { name: 'Store overview' })).toBeVisible();
  await second.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in to administration' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Fixture Guest');
});
