/**
 * Render presentation HTML → PDF + QA screenshots (Playwright).
 */
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
mkdirSync(join(root, 'qa'), { recursive: true });

const browser = await chromium.launch({ headless: true });

const pdfMap = [
  ['WINGMAN_MASTER_PRESENTATION.html', 'WINGMAN_MASTER_PRESENTATION.pdf'],
  ['WINGMAN_INVESTOR_DECK.html', 'WINGMAN_INVESTOR_DECK.pdf'],
  ['WINGMAN_USER_OVERVIEW.html', 'WINGMAN_USER_OVERVIEW.pdf'],
  ['WINGMAN_ONE_PAGER.html', 'WINGMAN_ONE_PAGER.pdf'],
];

for (const [htmlName, pdfName] of pdfMap) {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(join(src, htmlName)).href, { waitUntil: 'networkidle' });
  await page.pdf({
    path: join(root, pdfName),
    width: '13.333in',
    height: '7.5in',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  console.log('pdf', pdfName);
  await page.close();
}

const qa = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

for (const [htmlName, label] of [
  ['WINGMAN_MASTER_PRESENTATION.html', 'master'],
  ['WINGMAN_INVESTOR_DECK.html', 'investor'],
  ['WINGMAN_USER_OVERVIEW.html', 'user'],
  ['WINGMAN_ONE_PAGER.html', 'onepager'],
]) {
  await qa.goto(pathToFileURL(join(src, htmlName)).href, { waitUntil: 'networkidle' });
  const pages = await qa.$$('.page');
  console.log('qa', label, pages.length);
  for (let i = 0; i < pages.length; i++) {
    await pages[i].screenshot({
      path: join(root, 'qa', `${label}-${String(i + 1).padStart(2, '0')}.png`),
    });
  }
}

await browser.close();
console.log('PDF + QA COMPLETE');
