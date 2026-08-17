/**
 * Build Wingman presentation HTML + PDF suite.
 * Usage: node scripts/build.mjs
 */
import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { htmlDoc } from './helpers.mjs';
import { masterPages } from './pages-master.mjs';
import { investorPages } from './pages-investor.mjs';
import { userPages } from './pages-user.mjs';
import { onePager } from './pages-onepager.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
mkdirSync(src, { recursive: true });
mkdirSync(join(root, 'assets', 'screenshots'), { recursive: true });
mkdirSync(join(root, 'qa'), { recursive: true });

// Ensure shared.css is present (already written); copy path relative for HTML
const decks = [
  { name: 'master', file: 'WINGMAN_MASTER_PRESENTATION.html', title: 'Wingman — Master Presentation', pages: masterPages() },
  { name: 'investor', file: 'WINGMAN_INVESTOR_DECK.html', title: 'Wingman — Investor Deck', pages: investorPages() },
  { name: 'user', file: 'WINGMAN_USER_OVERVIEW.html', title: 'Wingman — User Overview', pages: userPages() },
  { name: 'onepager', file: 'WINGMAN_ONE_PAGER.html', title: 'Wingman — One Pager', pages: [onePager()] },
];

for (const d of decks) {
  const html = htmlDoc(d.title, './shared.css', d.pages.join('\n'));
  writeFileSync(join(src, d.file), html, 'utf8');
  console.log('wrote', d.file, d.pages.length, 'pages');
}

// PDF via playwright
async function renderPdfs() {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    console.log('Installing playwright...');
    const r = spawnSync('npm', ['install', 'playwright@1.49.1', '--no-save'], {
      cwd: root,
      shell: true,
      stdio: 'inherit',
    });
    if (r.status !== 0) throw new Error('npm install playwright failed');
    playwright = await import('playwright');
  }

  const { chromium } = playwright;
  // Ensure browser
  const br = spawnSync('npx', ['playwright', 'install', 'chromium'], {
    cwd: root,
    shell: true,
    stdio: 'inherit',
  });
  if (br.status !== 0) console.warn('playwright install chromium exited', br.status);

  const browser = await chromium.launch({ headless: true });
  const pdfMap = [
    ['WINGMAN_MASTER_PRESENTATION.html', 'WINGMAN_MASTER_PRESENTATION.pdf'],
    ['WINGMAN_INVESTOR_DECK.html', 'WINGMAN_INVESTOR_DECK.pdf'],
    ['WINGMAN_USER_OVERVIEW.html', 'WINGMAN_USER_OVERVIEW.pdf'],
    ['WINGMAN_ONE_PAGER.html', 'WINGMAN_ONE_PAGER.pdf'],
  ];

  for (const [htmlName, pdfName] of pdfMap) {
    const page = await browser.newPage();
    const fileUrl = pathToFileURL(join(src, htmlName)).href;
    await page.goto(fileUrl, { waitUntil: 'networkidle' });
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

  // QA screenshots of first + middle pages for master
  const qa = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await qa.goto(pathToFileURL(join(src, 'WINGMAN_MASTER_PRESENTATION.html')).href, { waitUntil: 'networkidle' });
  const sections = await qa.$$('.page');
  const indices = [0, 1, 6, 12, 18, 25, 33, sections.length - 1].filter((i, idx, a) => i < sections.length && a.indexOf(i) === idx);
  for (const i of indices) {
    await sections[i].screenshot({ path: join(root, 'qa', `master-page-${String(i + 1).padStart(2, '0')}.png`) });
  }
  console.log('qa screenshots', indices.length, 'of', sections.length, 'pages');

  // Also screenshot all pages for visual QA (master + others) — may be large
  for (const [htmlName, label] of [
    ['WINGMAN_INVESTOR_DECK.html', 'investor'],
    ['WINGMAN_USER_OVERVIEW.html', 'user'],
    ['WINGMAN_ONE_PAGER.html', 'onepager'],
  ]) {
    await qa.goto(pathToFileURL(join(src, htmlName)).href, { waitUntil: 'networkidle' });
    const pages = await qa.$$('.page');
    for (let i = 0; i < pages.length; i++) {
      await pages[i].screenshot({ path: join(root, 'qa', `${label}-page-${String(i + 1).padStart(2, '0')}.png`) });
    }
    console.log('qa', label, pages.length);
  }

  // Full master page screenshots for QA
  await qa.goto(pathToFileURL(join(src, 'WINGMAN_MASTER_PRESENTATION.html')).href, { waitUntil: 'networkidle' });
  const all = await qa.$$('.page');
  for (let i = 0; i < all.length; i++) {
    await all[i].screenshot({ path: join(root, 'qa', `master-full-${String(i + 1).padStart(2, '0')}.png`) });
  }
  console.log('qa master full', all.length);

  await browser.close();
}

await renderPdfs();
console.log('BUILD COMPLETE');
