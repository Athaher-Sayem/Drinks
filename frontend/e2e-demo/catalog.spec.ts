import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function loadVisibleCatalogPhotos(page: import('@playwright/test').Page) {
  for (const photo of await page.locator('.product-card img.product-photo').all()) {
    await photo.scrollIntoViewIfNeeded();
    await expect.poll(() => photo.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

test('exactly 100 products have distinct local photographs with attribution', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('note')).toContainText('Demonstration catalog');
  const catalog = await (await page.request.get('/api/v1/products?limit=100')).json();
  const categories = await (await page.request.get('/api/v1/categories?limit=100')).json();
  expect(catalog.total).toBe(100);
  expect(new Set(catalog.items.map((p: { slug: string }) => p.slug)).size).toBe(100);
  expect(categories.total).toBe(10);
  expect(new Set(catalog.items.map((p: { image_urls: string[] }) => p.image_urls[0])).size).toBe(100);
  for (const category of categories.items) expect(catalog.items.filter((p: { category_id: number }) => p.category_id === category.id)).toHaveLength(10);
  for (const product of catalog.items) {
    expect(product.attributes.photo_source).toContain('https://commons.wikimedia.org/wiki/File:');
    expect(product.attributes.photo_credit).toBeTruthy();
    const response = await page.request.get(product.image_urls[0]);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/webp');
    expect((await response.body()).byteLength).toBeGreaterThan(100);
  }
  await page.goto('/photo-credits.html');
  await expect(page.locator('article')).toHaveCount(100);
  await expect(page.getByRole('link', { name: 'Original file and provenance' })).toHaveCount(100);
});

test('all nine collection pages render real photos without missing or duplicate products', async ({ page }, testInfo) => {
  await page.goto('/');
  const names: string[] = [];
  for (let index = 0; index < 9; index++) {
    const cards = page.locator('.product-card');
    await expect(cards).toHaveCount(index === 8 ? 4 : 12);
    const photos = cards.locator('img.product-photo');
    await expect(photos).toHaveCount(index === 8 ? 4 : 12);
    for (const photo of await photos.all()) {
      await photo.scrollIntoViewIfNeeded();
      await expect.poll(() => photo.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    }
    names.push(...await cards.getByRole('heading', { level: 3 }).allTextContents());
    if (index < 8) {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.getByText(`Page ${index + 2} of 9`, { exact: true })).toBeVisible();
    }
  }
  expect(names).toHaveLength(100);
  expect(new Set(names).size).toBe(100);
  await page.goto('/');
  await expect(page.locator('.product-card')).toHaveCount(12);
  await page.evaluate(() => document.fonts.ready);
  await loadVisibleCatalogPhotos(page);
  await page.screenshot({ path: testInfo.outputPath('general-store-desktop.png'), fullPage: true });
});

test('general-store filters, product credits, accessibility and mobile layout work', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore Technology', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(10);
  await page.getByRole('button', { name: 'All goods', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search the collection' }).fill('pencil');
  await expect(page.locator('.product-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'View Colored Pencils' }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Full photo credits' })).toHaveAttribute('href', '/photo-credits.html#colored-pencils');
  await page.keyboard.press('Escape');
  await page.getByRole('searchbox', { name: 'Search the collection' }).fill('');
  await expect(page.locator('.product-card')).toHaveCount(12);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await loadVisibleCatalogPhotos(page);
  await page.screenshot({ path: testInfo.outputPath('general-store-mobile.png'), fullPage: true });
});
