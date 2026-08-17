/**
 * Write HTML decks only (no PDF).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlDoc } from './helpers.mjs';
import { masterPages } from './pages-master.mjs';
import { investorPages } from './pages-investor.mjs';
import { userPages } from './pages-user.mjs';
import { onePager } from './pages-onepager.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
mkdirSync(src, { recursive: true });

const decks = [
  { file: 'WINGMAN_MASTER_PRESENTATION.html', title: 'Wingman — Master Presentation', pages: masterPages() },
  { file: 'WINGMAN_INVESTOR_DECK.html', title: 'Wingman — Investor Deck', pages: investorPages() },
  { file: 'WINGMAN_USER_OVERVIEW.html', title: 'Wingman — User Overview', pages: userPages() },
  { file: 'WINGMAN_ONE_PAGER.html', title: 'Wingman — One Pager', pages: [onePager()] },
];

for (const d of decks) {
  writeFileSync(join(src, d.file), htmlDoc(d.title, './shared.css', d.pages.join('\n')), 'utf8');
  console.log('wrote', d.file, d.pages.length, 'pages');
}
