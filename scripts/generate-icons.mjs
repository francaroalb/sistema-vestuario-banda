import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const svg = await readFile('public/icons/icon.svg', 'utf8');
  for (const size of [192, 512, 180]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>body{margin:0}svg{width:100vw;height:100vh;display:block}</style>${svg}`,
    );
    await page.screenshot({
      path:
        size === 180
          ? 'public/apple-touch-icon.png'
          : `public/icons/icon-${size}.png`,
    });
    if (size === 512)
      await page.screenshot({ path: 'public/icons/icon-maskable-512.png' });
  }
} finally {
  await browser.close();
}
