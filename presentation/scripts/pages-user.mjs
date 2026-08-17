import { coverPage, pageShell } from './helpers.mjs';

const TOTAL = 8;

function p(part, num, title, body) {
  return pageShell({ part, num, total: TOTAL, title, body });
}

export function userPages() {
  const pages = [];
  pages.push(coverPage({
    subtitle: 'A calm way to say hello to someone nearby — privately, mutually, briefly.',
    deck: 'User Overview',
    total: TOTAL,
    confidential: false,
  }));

  pages.push(p('For you', 2, 'The idea', `
    <h1 class="wide">You notice someone. Wingman helps you check if it’s mutual — without a public profile circus.</h1>
    <div class="grid-2" style="margin-top:20px;">
      <div class="card"><h3>Not a dating catalogue</h3><p>No endless swiping. No public photo browsing.</p></div>
      <div class="card"><h3>Built for real life</h3><p>Café, campus, conference, festival — when you’re already near.</p></div>
    </div>
  `));

  pages.push(p('For you', 3, 'How it works', `
    <img class="diagram" src="../assets/diagrams/protocol-flow.svg" alt="How Wingman works"/>
    <p style="margin-top:16px;">Free: 2 Signals per day. One connection at a time. About 15 minutes to arrange a meet.</p>
  `));

  pages.push(p('For you', 4, 'Your steps', `
    <div class="grid-4">
      <div class="card tight"><h3>1 · Radar</h3><p>Appear nearby as an anonymous presence.</p></div>
      <div class="card tight"><h3>2 · Signal</h3><p>Send interest privately. If ignored, it expires silently.</p></div>
      <div class="card tight"><h3>3 · Selfies</h3><p>Quick mutual check — temporary, not a gallery.</p></div>
      <div class="card tight"><h3>4 · Mission</h3><p>Short chat to meet for real. Then cool down.</p></div>
    </div>
  `));

  pages.push(p('For you', 5, 'See the product', `
    <div class="phones">
      <div>
        <div class="phone"><img src="../assets/screenshots/01-splash.png" alt="Wingman splash"/></div>
        <div class="phone-label">Open Wingman</div>
      </div>
      <div>
        <div class="phone"><img src="../assets/screenshots/02-onboarding-problem.png" alt="Onboarding"/></div>
        <div class="phone-label">Why it exists</div>
      </div>
    </div>
  `));

  pages.push(p('For you', 6, 'Safety & privacy', `
    <div class="grid-3">
      <div class="card"><h3>You’re in control</h3><p>Invisible mode. Block. Report. Destiny off by default.</p></div>
      <div class="card"><h3>Approximate location</h3><p>Others don’t get your exact pin.</p></div>
      <div class="card"><h3>Be smart IRL</h3><p>Meet in public. Wingman helps with consent — it can’t guarantee safety.</p></div>
    </div>
  `));

  pages.push(p('For you', 7, 'FAQ', `
    <dl class="faq">
      <dt>Do they see if I ignore a Signal?</dt>
      <dd>No rejection message. It simply expires.</dd>
      <dt>Is my phone number shared?</dt>
      <dd>No. Used for identity — never shown to other users.</dd>
      <dt>Can I chat forever?</dt>
      <dd>Mission Meet is short on purpose — so you meet in real life.</dd>
    </dl>
  `));

  pages.push(p('For you', 8, 'Start', `
    <div class="hero-center center-all" style="flex:1;">
      <h1 class="center">From presence to hello.</h1>
      <p class="lead" style="text-align:center;">Wingman helps you make the first acquaintance.</p>
      <p class="tiny">Field-test surface: product UI evolving · some builds may be demo-mode without full backend.</p>
    </div>
  `));

  return pages;
}

export const USER_TOTAL = TOTAL;
