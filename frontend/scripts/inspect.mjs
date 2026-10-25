import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Explore Accessories' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    console.log(JSON.stringify(await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      spilling: [...document.querySelectorAll('body *')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => ({tag:e.tagName, cls:String(e.className), client:e.clientWidth, scroll:e.scrollWidth})),
      overflow: [...document.querySelectorAll('body *')].map(e => ({
        tag: e.tagName, cls: String(e.className), x: e.getBoundingClientRect().x, right: e.getBoundingClientRect().right,
      })).filter(e => e.right > innerWidth + 1 || e.x < -1),
    }))));
    await page.screenshot({ path: `artifacts/storefront-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'View Stoneware Mug' }).click();
  await page.screenshot({ path: 'artifacts/product-dialog-390.png', fullPage: true });
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    console.log('Focus', await page.evaluate(() => ({ tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label'), inDialog: !!document.activeElement?.closest('dialog') })));
  }
} finally { await browser.close(); }
