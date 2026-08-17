/**
 * Copy MCP screenshots into presentation assets and create conceptual diagrams.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'assets', 'screenshots');
const diagrams = join(root, 'assets', 'diagrams');
mkdirSync(shots, { recursive: true });
mkdirSync(diagrams, { recursive: true });

const temp = join(homedir(), 'AppData', 'Local', 'Temp', 'cursor', 'screenshots');
const pairs = [
  ['wingman-splash.png', '01-splash.png'],
  ['wingman-onboarding-problem.png', '02-onboarding-problem.png'],
];
for (const [src, dest] of pairs) {
  const from = join(temp, src);
  if (existsSync(from)) {
    copyFileSync(from, join(shots, dest));
    console.log('copied', dest);
  } else {
    console.warn('missing', from);
  }
}

const protocolSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 320" role="img" aria-label="Wingman protocol flow">
  <rect width="1200" height="320" fill="#0B1020"/>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#7C5CFC"/>
      <stop offset="100%" stop-color="#B9A7FF"/>
    </linearGradient>
  </defs>
  ${[
    ['RADAR', '#3DDC97', 40],
    ['SIGNAL', '#4DA3FF', 185],
    ['SELFIE A', '#B9A7FF', 330],
    ['SELFIE B', '#B9A7FF', 475],
    ['MUTUAL', '#9B6DFF', 620],
    ['MISSION', '#FF8A4C', 765],
    ['MODE', '#FF8A4C', 910],
    ['COOLDOWN', '#8B93A7', 1055],
  ].map(([label, color, x]) => `
    <rect x="${x}" y="110" width="120" height="56" rx="28" fill="#171F35" stroke="${color}" stroke-width="2"/>
    <text x="${x + 60}" y="144" fill="#F4F5F7" font-family="Segoe UI, Arial" font-size="14" font-weight="700" text-anchor="middle">${label}</text>
  `).join('')}
  ${[160, 305, 450, 595, 740, 885, 1030].map((x) => `
    <path d="M${x} 138 L${x + 20} 138" stroke="url(#g)" stroke-width="2"/>
  `).join('')}
  <text x="600" y="50" fill="#B9A7FF" font-family="Segoe UI, Arial" font-size="16" letter-spacing="3" text-anchor="middle">WINGMAN PROTOCOL</text>
  <text x="600" y="250" fill="#A8B0C2" font-family="Segoe UI, Arial" font-size="14" text-anchor="middle">Then back to Radar. One intentional loop — not an endless feed.</text>
</svg>`;

const compareSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 520" role="img" aria-label="Wingman vs dating apps">
  <rect width="1200" height="520" fill="#0B1020"/>
  <rect x="40" y="80" width="520" height="400" rx="20" fill="#171F35" stroke="rgba(255,77,103,0.35)"/>
  <rect x="640" y="80" width="520" height="400" rx="20" fill="#171F35" stroke="rgba(61,220,151,0.35)"/>
  <text x="300" y="130" fill="#FF4D67" font-family="Segoe UI, Arial" font-size="22" font-weight="700" text-anchor="middle">Dating apps</text>
  <text x="900" y="130" fill="#3DDC97" font-family="Segoe UI, Arial" font-size="22" font-weight="700" text-anchor="middle">Wingman</text>
  ${[
    ['Public profiles &amp; photos', 'No public profile browsing'],
    ['Swipe → match volume', 'Signal → mutual consent'],
    ['Endless chat in-app', '~15 min Mission Meet'],
    ['Optimize time-in-app', 'Optimize real meetings'],
    ['Explicit rejection UX', 'Silent expiry only'],
    ['Remote discovery', 'Already nearby'],
  ].map((row, i) => {
    const y = 180 + i * 42;
    return `<text x="70" y="${y}" fill="#A8B0C2" font-family="Segoe UI, Arial" font-size="16">${row[0]}</text>
            <text x="670" y="${y}" fill="#F4F5F7" font-family="Segoe UI, Arial" font-size="16">${row[1]}</text>`;
  }).join('')}
  <text x="600" y="45" fill="#B9A7FF" font-family="Segoe UI, Arial" font-size="16" letter-spacing="3" text-anchor="middle">PHILOSOPHY DIFFERENCE</text>
</svg>`;

const archSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 480" role="img" aria-label="Simplified Wingman architecture">
  <rect width="1200" height="480" fill="#0B1020"/>
  <text x="600" y="40" fill="#B9A7FF" font-family="Segoe UI, Arial" font-size="16" letter-spacing="3" text-anchor="middle">SIMPLIFIED ARCHITECTURE (CONFIRMED)</text>
  ${[
    [80, 90, 240, 70, 'Mobile / Web Client', '#4DA3FF'],
    [480, 90, 240, 70, 'NestJS API + WS', '#7C5CFC'],
    [880, 90, 240, 70, 'Workers (reconcile)', '#FF8A4C'],
    [180, 230, 240, 70, 'PostgreSQL durable', '#3DDC97'],
    [480, 230, 240, 70, 'Redis ephemeral', '#FFC857'],
    [780, 230, 300, 70, 'Providers: SMS / Push / Stripe', '#B9A7FF'],
    [360, 360, 480, 70, 'Frozen domain: packages/domain (WingmanEngine)', '#9B6DFF'],
  ].map(([x,y,w,h,label,c]) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#171F35" stroke="${c}" stroke-width="2"/>
    <text x="${x + w/2}" y="${y + 42}" fill="#F4F5F7" font-family="Segoe UI, Arial" font-size="16" font-weight="650" text-anchor="middle">${label}</text>
  `).join('')}
</svg>`;

const statusSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 420" role="img" aria-label="Status matrix">
  <rect width="1200" height="420" fill="#0B1020"/>
  <text x="600" y="40" fill="#B9A7FF" font-family="Segoe UI, Arial" font-size="16" letter-spacing="3" text-anchor="middle">WHERE WINGMAN IS TODAY</text>
  ${[
    [40, 80, '#3DDC97', 'A · IMPLEMENTED', 'S0–S20 Backend V1 GO\nProtocol engine frozen\nNest / PG / Redis / WS\nBilling→Entitlements (payments OFF)'],
    [320, 80, '#FFC857', 'B · FLAGGED / INTERNAL', 'S21 Radar Intelligence\nS22 Context Engine\nS23 Destiny V2\nS24 Anti-Abuse\nS25 Geo · S26 Measurement'],
    [600, 80, '#4DA3FF', 'C · FIELD / VALIDATION', 'Surface UI on Vercel\nLive Field Test S27–S34\nS27A OPEN (not GREEN)\nS27B SMS deferred'],
    [880, 80, '#8B93A7', 'D · PLANNED / VISION', 'Public Destiny (gated)\nPayments go-live\nCity density launch\nLearning after baselines'],
  ].map(([x,y,c,title,body]) => `
    <rect x="${x}" y="${y}" width="260" height="300" rx="18" fill="#171F35" stroke="${c}" stroke-width="2"/>
    <circle cx="${x+28}" cy="${y+34}" r="8" fill="${c}"/>
    <text x="${x+48}" y="${y+40}" fill="#F4F5F7" font-family="Segoe UI, Arial" font-size="14" font-weight="700">${title}</text>
    ${body.split('\n').map((line, i) => `<text x="${x+24}" y="${y+90 + i*28}" fill="#A8B0C2" font-family="Segoe UI, Arial" font-size="14">${line}</text>`).join('')}
  `).join('')}
</svg>`;

writeFileSync(join(diagrams, 'protocol-flow.svg'), protocolSvg);
writeFileSync(join(diagrams, 'vs-dating-apps.svg'), compareSvg);
writeFileSync(join(diagrams, 'architecture.svg'), archSvg);
writeFileSync(join(diagrams, 'status-matrix.svg'), statusSvg);
console.log('diagrams written');
