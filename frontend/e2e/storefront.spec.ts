import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('product modal reports add failures and success without unhandled rejections', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'View Canvas Tote' }).click();
  const dialog = page.getByRole('dialog', { name: 'Canvas Tote' });
  await page.route('**/api/v1/cart/items/*', route => route.fulfill({ status: 409, json: { detail: 'Not enough stock.' } }));
  await dialog.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Not enough stock.');
  expect(errors).toEqual([]);
  await page.unroute('**/api/v1/cart/items/*');
  await dialog.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Added to your bag');
});

test('uncertain checkout survives a denied retry and reload with an empty cart', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Canvas Tote to bag' }).click();
  await page.getByRole('button', { name: /Open bag/ }).click();
  await page.getByRole('button', { name: 'Continue to checkout' }).click();
  await page.getByLabel('Full name').fill('Recovery test');
  await page.getByLabel('Email address', { exact: true }).fill('recovery@example.com');
  await page.getByLabel('Phone number').fill('2025550142');
  await page.getByRole('button', { name: 'Review order' }).click();
  await expect(page.getByRole('heading', { name: 'One last look.' })).toBeFocused();
  const keys: string[] = [];
  let attempts = 0;
  let releaseRecovery = () => {};
  const recoveryGate = new Promise<void>(resolve => { releaseRecovery = resolve; });
  await page.route('**/api/v1/orders', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    attempts += 1;
    if (attempts === 1) { await route.fetch(); await route.abort('failed'); }
    else if (attempts === 2) await route.fulfill({ status: 403, json: { detail: 'CSRF expired' } });
    else { const response = await route.fetch(); await recoveryGate; await route.fulfill({ response }); }
  });
  await page.getByRole('button', { name: 'Place order — no payment' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Place order — no payment' }).click();
  await expect(page.getByRole('alert')).toContainText('session');
  expect(await page.evaluate(() => localStorage.getItem('store.checkout.intent.v1'))).not.toBeNull();
  await page.reload();
  await page.getByRole('button', { name: /Open bag/ }).click();
  await page.getByRole('button', { name: 'Recover previous order' }).click();
  await page.getByLabel('Full name').fill('Recovery test');
  await page.getByLabel('Email address', { exact: true }).fill('recovery@example.com');
  await page.getByLabel('Phone number').fill('2025550142');
  await page.getByRole('button', { name: 'Recover previous order' }).click();
  await expect(page.getByRole('button', { name: 'Back to your bag' })).toBeDisabled();
  releaseRecovery();
  await expect(page.getByRole('heading', { name: 'Your good things are on their way.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your good things are on their way.' })).toBeFocused();
  expect(keys).toHaveLength(3);
  expect(new Set(keys).size).toBe(1);
  await page.getByRole('button', { name: 'Cancel this order' }).click();
  await expect(page.getByText('Order cancelled. No payment was taken.')).toBeVisible();
});

test('connected collection explorer, search and product details', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /A little good/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore Accessories' })).toBeVisible();
  await page.getByRole('button', { name: 'Explore Accessories' }).click();
  await expect(page.getByRole('heading', { name: 'Canvas Tote', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stoneware Mug', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'All goods', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search the collection' }).fill('stoneware');
  await expect(page.getByRole('heading', { name: 'Stoneware Mug', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View Stoneware Mug' }).click();
  await expect(page.getByRole('dialog', { name: 'Stoneware Mug' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('cart persists and payment-free order can be placed and cancelled', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Canvas Tote to bag' }).click();
  await page.getByRole('button', { name: /Open bag/ }).click();
  await expect(page.getByRole('dialog', { name: 'Your bag' })).toBeVisible();
  await expect(page.getByText('Canvas Tote', { exact: true }).last()).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Open bag/ }).click();
  await page.getByRole('button', { name: 'Continue to checkout' }).click();
  await page.getByLabel('Full name').fill('Browser test');
  await page.getByLabel('Email address', { exact: true }).fill('browser@example.com');
  await page.getByLabel('Phone number').fill('2025550142');
  await page.getByRole('button', { name: 'Review order' }).click();
  await page.getByRole('button', { name: 'Place order — no payment' }).click();
  await expect(page.getByRole('heading', { name: 'Your good things are on their way.' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel this order' }).click();
  await expect(page.getByText('Order cancelled. No payment was taken.')).toBeVisible();
});

test('landing is accessible and responsive', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Explore Accessories' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('heading', { name: /A little good/i })).toBeVisible();
  }
});

test('checkout rejects a cart changed after review and requires a fresh review', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Canvas Tote to bag' }).click();
  await page.getByRole('button', { name: /Open bag/ }).click();
  await page.getByRole('button', { name: 'Continue to checkout' }).click();
  await page.getByLabel('Full name').fill('Quote test');
  await page.getByLabel('Email address', { exact: true }).fill('quote@example.com');
  await page.getByLabel('Phone number').fill('2025550142');
  await page.getByRole('button', { name: 'Review order' }).click();
  await expect(page.getByRole('heading', { name: 'One last look.' })).toBeFocused();
  const session = await (await page.request.get('/api/v1/session')).json();
  const cart = await (await page.request.get('/api/v1/cart')).json();
  await page.request.put(`/api/v1/cart/items/${cart.items[0].variant_id}`, { data: { quantity: 2 }, headers: { 'X-CSRF-Token': session.csrf_token } });
  await page.getByRole('button', { name: 'Place order — no payment' }).click();
  await expect(page.getByRole('alert')).toContainText('review your order again');
  await page.getByRole('button', { name: 'Edit details' }).click();
  await expect(page.getByLabel('Full name')).toHaveValue('Quote test');
  await page.getByRole('button', { name: 'Review order' }).click();
  await expect(page.getByText(`${cart.items[0].variant_name} × 2`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Place order — no payment' }).click();
  await expect(page.getByRole('heading', { name: 'Your good things are on their way.' })).toBeFocused();
  await page.getByRole('button', { name: 'Cancel this order' }).click();
  await expect(page.getByText('Order cancelled. No payment was taken.')).toBeVisible();
});

test('pending checkout survives closing its tab and is recoverable in a second tab', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Canvas Tote to bag' }).click();
  await page.getByRole('button', { name: /Open bag/ }).click();
  await page.getByRole('button', { name: 'Continue to checkout' }).click();
  await page.getByLabel('Full name').fill('Cross tab test');
  await page.getByLabel('Email address', { exact: true }).fill('tabs@example.com');
  await page.getByLabel('Phone number').fill('2025550142');
  await page.getByRole('button', { name: 'Review order' }).click();
  await page.route('**/api/v1/orders', async route => { await route.fetch(); await route.abort('failed'); });
  await page.getByRole('button', { name: 'Place order — no payment' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  const second = await context.newPage();
  await page.close();
  await second.goto('/');
  await second.getByRole('button', { name: /Open bag/ }).click();
  await second.getByRole('button', { name: 'Recover previous order' }).click();
  await second.getByLabel('Full name').fill('Cross tab test');
  await second.getByLabel('Email address', { exact: true }).fill('tabs@example.com');
  await second.getByLabel('Phone number').fill('2025550142');
  await second.getByRole('button', { name: 'Recover previous order' }).click();
  await expect(second.getByRole('heading', { name: 'Your good things are on their way.' })).toBeVisible();
  await second.getByRole('button', { name: 'Cancel this order' }).click();
  await expect(second.getByText('Order cancelled. No payment was taken.')).toBeVisible();
});

test('registration, login, order history, and logout use the real account API', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const account = page.getByRole('dialog');
  await account.getByRole('button', { name: 'Create an account' }).click();
  await account.getByLabel('Your name').fill('Browser Customer');
  const email = `browser-${crypto.randomUUID()}@example.com`;
  await account.getByLabel('Email address').fill(email);
  await account.getByLabel('Password').fill('Browser-test-passphrase-493!');
  await account.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(account.getByRole('status')).toContainText('Your account is ready');
  await account.getByLabel('Email address').fill(email);
  await account.getByLabel('Password').fill('Browser-test-passphrase-493!');
  await account.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(account.getByRole('heading', { name: 'Hello, Browser.' })).toBeVisible();
  await expect(account.getByText('No orders yet.', { exact: false })).toBeVisible();
  await account.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Add Canvas Tote to bag' }).click();
  await page.getByRole('button', { name: /Open bag/ }).click();
  await page.getByRole('button', { name: 'Continue to checkout' }).click();
  await expect(page.getByLabel('Full name')).toHaveValue('Browser Customer');
  await page.getByLabel('Phone number').fill('2025550142');
  await page.getByRole('button', { name: 'Review order' }).click();
  await page.getByRole('button', { name: 'Place order — no payment' }).click();
  await expect(page.getByRole('heading', { name: 'Your good things are on their way.' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel this order' }).click();
  await expect(page.getByText('Order cancelled. No payment was taken.')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Your account', exact: true }).click();
  await account.getByRole('button', { name: /Order .*Cancelled/ }).click();
  await expect(account.getByText('Order cancelled. No payment was taken.')).toBeVisible();
  await account.getByRole('button', { name: 'Sign out' }).click();
  await expect(account.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('empty catalog and catalog outages give actionable states', async ({ page }) => {
  await page.route('**/api/v1/products?**', route => route.fulfill({ json: { items: [], total: 0, offset: 0, limit: 12 } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Nothing here just yet.' })).toBeVisible();
  await page.route('**/api/v1/products?**', route => route.fulfill({ status: 503, json: { detail: 'Catalog temporarily unavailable.' } }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'We couldn’t load the collection.' })).toBeVisible();
  await page.unroute('**/api/v1/products?**');
  await page.getByRole('button', { name: 'Try again', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'View Canvas Tote' })).toBeVisible();
});

test('a failed cart connection can be retried inside its modal', async ({ page }) => {
  await page.route('**/api/v1/cart', route => route.fulfill({ status: 503, json: { detail: 'Bag temporarily unavailable.' } }));
  await page.goto('/');
  await page.getByRole('button', { name: /Open bag/ }).click();
  const bag = page.getByRole('dialog', { name: 'Your bag' });
  await expect(bag.getByRole('alert')).toContainText('Bag temporarily unavailable.');
  await page.unroute('**/api/v1/cart');
  await bag.getByRole('button', { name: 'Retry connection' }).click();
  await expect(bag.getByRole('heading', { name: 'A little room for good things.' })).toBeVisible();
});

test('guest tracking uses a private lookup key without storing it or putting it in a URL', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Canvas Tote to bag' }).click();
  await page.getByRole('button', { name: /Open bag/ }).click();
  await page.getByRole('button', { name: 'Continue to checkout' }).click();
  await page.getByLabel('Full name').fill('Lookup test');
  await page.getByLabel('Email address', { exact: true }).fill('lookup@example.com');
  await page.getByLabel('Phone number').fill('2025550142');
  await page.getByRole('button', { name: 'Review order' }).click();
  const response = page.waitForResponse(r => r.url().endsWith('/api/v1/orders') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Place order — no payment' }).click();
  const receipt = await (await response).json();
  await expect(page.getByRole('heading', { name: 'Your good things are on their way.' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Track an order' }).click();
  await page.getByLabel('Order reference', { exact: true }).fill(receipt.id);
  await page.getByLabel('Private lookup key', { exact: true }).fill(receipt.lookup_token);
  await page.getByRole('button', { name: 'Find order', exact: true }).click();
  await expect(page.getByText(receipt.id, { exact: true })).toBeVisible();
  expect(page.url()).not.toContain(receipt.lookup_token);
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(storage).not.toContain(receipt.lookup_token);
  expect(storage).not.toContain('lookup@example.com');
  await page.getByRole('button', { name: 'Cancel this order' }).click();
  await expect(page.getByText('Order cancelled. No payment was taken.')).toBeVisible();
});

test('mobile dialogs are accessible, keep keyboard focus, and restore it when closed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const view = page.getByRole('button', { name: 'View Stoneware Mug' });
  await view.click();
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(view).toBeFocused();
  await page.getByRole('button', { name: 'Add Canvas Tote to bag' }).click();
  await page.getByRole('button', { name: /Open bag/ }).click();
  await page.getByRole('button', { name: 'Continue to checkout' }).click();
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
  expect(await page.getByRole('dialog').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
});

test('products without active variants are unavailable, not infinitely priced', async ({ page }) => {
  await page.route('**/api/v1/products?**', async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ json: { ...data, items: [{ ...data.items[0], variants: [] }], total: 1 } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add Canvas Tote to bag' })).toBeDisabled();
  await expect(page.getByText('Coming soon', { exact: true }).first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText('∞');
});

test('lost authentication replies reconcile session and clear private account state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const account = page.getByRole('dialog');
  await account.getByRole('button', { name: 'Create an account' }).click();
  await account.getByLabel('Your name').fill('Recovery Customer');
  const email = `auth-recovery-${crypto.randomUUID()}@example.com`;
  await account.getByLabel('Email address').fill(email);
  await account.getByLabel('Password').fill('Browser-test-passphrase-493!');
  await account.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(account.getByRole('status')).toContainText('Your account is ready');
  await page.route('**/api/v1/auth/login', async route => { await route.fetch(); await route.abort('failed'); });
  await account.getByLabel('Email address').fill(email);
  await account.getByLabel('Password').fill('Browser-test-passphrase-493!');
  await account.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(account.getByRole('heading', { name: 'Hello, Recovery.' })).toBeVisible();
  await page.route('**/api/v1/auth/logout', async route => { await route.fetch(); await route.abort('failed'); });
  await account.getByRole('button', { name: 'Sign out' }).click();
  await expect(account.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(account).not.toContainText(email);
});
