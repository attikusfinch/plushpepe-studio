import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

// Start npm run dev first. Use the same renderer as the canvas and PNG export.
const url = process.argv[2] || 'http://127.0.0.1:5180/';
const windowsChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const executablePath = process.env.CHROME_PATH || (process.platform === 'win32' && existsSync(windowsChrome) ? windowsChrome : undefined);
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage();
  await page.goto(url);
  for (let n = 34; n <= 83; n++) {
    const id = String(n).padStart(3, '0');
    if (id === '061') continue; // The silhouette has no face to correct.
    const png = await page.evaluate(async modelId => {
      const { renderLayer } = await import('/src/media.js');
      const full = await renderLayer({ type: 'pepe', modelId }, {});
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      canvas.getContext('2d').drawImage(full, 128, 128, 512, 512, 0, 0, 512, 512);
      return canvas.toDataURL('image/png').split(',')[1];
    }, id);
    await writeFile(new URL(`../public/models/standing/png/${id}.png`, import.meta.url), Buffer.from(png, 'base64'));
  }
  console.log('Updated 49 model previews with the default face; silhouette unchanged.');
} finally {
  await browser.close();
}
