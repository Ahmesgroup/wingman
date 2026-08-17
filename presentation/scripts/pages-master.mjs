import { coverPage, pageShell } from './helpers.mjs';

const TOTAL = 42;

function p(part, num, title, body, compact) {
  return pageShell({ part, num, total: TOTAL, title, body, compact });
}

export function masterPages() {
  const pages = [];

  pages.push(coverPage({
    subtitle: 'A real-time protocol that turns proximity into permission to say hello — then gets out of the way.',
    deck: 'Master Presentation',
    total: TOTAL,
  }));

  pages.push(p('Part I · Opening', 2, 'Agenda', `
    <h1 class="wide">What this deck answers</h1>
    <div class="grid-2" style="margin-top:12px;">
      <div class="card"><h3>Story</h3><ul>
        <li>Why Wingman needs to exist</li>
        <li>The human problem it solves</li>
        <li>How the protocol works</li>
        <li>Why it is not Tinder / Instagram</li>
      </ul></div>
      <div class="card"><h3>Evidence</h3><ul>
        <li>What is built today (A–D status)</li>
        <li>Safety, privacy, intelligence honesty</li>
        <li>Monetization models to validate</li>
        <li>Field-test gates still open</li>
      </ul></div>
    </div>
    <p class="note">Status labels: <strong>A Implemented</strong> · <strong>B Feature-flagged / internal</strong> · <strong>C Field test / validation</strong> · <strong>D Planned / vision</strong>. Destiny is not presented as a public core feature.</p>
  `));

  pages.push(p('Part I · Opening', 3, 'The moment', `
    <div class="split">
      <div>
        <h1>You notice someone. Then nothing happens.</h1>
        <p class="lead">Café. Campus. Conference. Festival. The desire is real — the permission is missing.</p>
        <p>Wingman exists for that gap: between noticing and meeting.</p>
      </div>
      <div class="card">
        <h3>Mission</h3>
        <p class="quote" style="font-size:28px;">From presence to hello.</p>
        <p style="margin-top:18px;"><strong>Wingman is a real-world connection facilitator.</strong> It helps two people who are already near each other safely discover mutual interest and say hello in real life.</p>
      </div>
    </div>
  `));

  pages.push(p('Part II · The Problem', 4, 'THE PROBLEM', `
    <h1 class="wide">The first “hello” is still hard</h1>
    <div class="grid-3" style="margin-top:8px;">
      <div class="scenario card"><strong>Café</strong><p>You catch a glance. You leave. The window closes in seconds.</p></div>
      <div class="scenario card"><strong>Campus</strong><p>Same lecture hall for weeks. No social script that feels safe.</p></div>
      <div class="scenario card"><strong>Conference / Festival</strong><p>Surrounded by strangers you might click with — and zero facilitation.</p></div>
    </div>
    <p style="margin-top:22px;">Fear of rejection. Uncertainty of mutual interest. No discreet facilitator. Privacy anxiety. Existing apps solve <em>remote discovery</em>, not the real-world approach.</p>
  `));

  pages.push(p('Part II · The Problem', 5, 'What people already tried', `
    <h1 class="wide">Dating apps didn’t remove the social cost</h1>
    <div class="grid-2">
      <div class="card">
        <h3>What they optimize</h3>
        <ul>
          <li>Matches and message volume</li>
          <li>Time spent swiping and chatting</li>
          <li>Remote discovery at infinite scale</li>
        </ul>
      </div>
      <div class="card">
        <h3>What still breaks</h3>
        <ul>
          <li>Public profiles &amp; performative photos</li>
          <li>Explicit rejection mechanics</li>
          <li>Chat that never becomes a meeting</li>
          <li>Someone standing five meters away — still unreachable</li>
        </ul>
      </div>
    </div>
    <p class="cite">Context (US): 53% of adults under 30 have used a dating site/app; experiences are mixed — Pew Research Center, Feb 2023 (survey July 2022).</p>
  `));

  pages.push(p('Part II · The Problem', 6, 'The cost of silence', `
    <h1>Every day, attraction dies of hesitation</h1>
    <p class="lead">Not because people don’t want connection — because the first step feels exposed, irreversible, and socially expensive.</p>
    <div class="pill-row">
      <span class="state-chip"><span class="dot red"></span>Fear of rejection</span>
      <span class="state-chip"><span class="dot amber"></span>Unclear mutual interest</span>
      <span class="state-chip"><span class="dot grey"></span>No private channel</span>
      <span class="state-chip"><span class="dot blue"></span>Wrong tool for proximity</span>
    </div>
    <p>Wingman’s bet: lower the emotional cost of the first move without increasing public exposure or addictive engagement.</p>
  `));

  pages.push(p('Part III · The Solution', 7, 'THE WINGMAN SOLUTION', `
    <h1 class="wide">Wingman doesn’t introduce profiles. It creates permission to say hello.</h1>
    <p class="lead">A short, private protocol for two people who are already near each other.</p>
    <div class="flow">
      <span class="step" style="border-color:#3DDC97;color:#3DDC97;">Radar</span><span class="arrow">→</span>
      <span class="step" style="border-color:#4DA3FF;color:#4DA3FF;">Signal</span><span class="arrow">→</span>
      <span class="step" style="border-color:#B9A7FF;color:#B9A7FF;">Selfies</span><span class="arrow">→</span>
      <span class="step" style="border-color:#9B6DFF;color:#9B6DFF;">Mutual validation</span><span class="arrow">→</span>
      <span class="step" style="border-color:#FF8A4C;color:#FF8A4C;">Mission Meet</span><span class="arrow">→</span>
      <span class="step" style="border-color:#8B93A7;color:#8B93A7;">Cooldown</span><span class="arrow">→</span>
      <span class="step">Radar</span>
    </div>
    <p>Product rule: any feature that increases time-in-app without increasing the chance of a real interaction must be rejected.</p>
  `));

  pages.push(p('Part III · The Solution', 8, 'Design constraints that create outcomes', `
    <h1 class="wide">Intention by design</h1>
    <div class="grid-3">
      <div class="card"><h3>2 Signals / day (Free)</h3><p>Scarcity protects attention. No spray-and-pray.</p></div>
      <div class="card"><h3>1 active connection</h3><p>Focus on one person — enforced as a system invariant, not a slogan.</p></div>
      <div class="card"><h3>~15 min Mission chat</h3><p>Enough to arrange a meet. Not enough to live in the app.</p></div>
    </div>
    <div class="grid-3" style="margin-top:18px;">
      <div class="card"><h3>Silent expiry</h3><p>No decline button. No rejection notification.</p></div>
      <div class="card"><h3>Approximate location</h3><p>Distance bands — never exact coordinates to peers.</p></div>
      <div class="card"><h3>Ephemeral media</h3><p>Selfies are temporary, opaque, and not a public gallery.</p></div>
    </div>
  `));

  pages.push(p('Part IV · Product Walkthrough', 9, 'How it works · 1–2', `
    <div class="grid-2">
      <div class="card"><div class="big-number">01</div><h3>Activate Radar</h3><p>You become discoverable nearby — Active, Invisible (default), or hidden in Mission. Anonymous dots on an abstract surface, not a public map of faces.</p></div>
      <div class="card"><div class="big-number">02</div><h3>Send a Signal</h3><p>Express interest privately. Free: 2/day. One active Signal per pair. Expires silently after ~10 minutes. No one is told they were declined.</p></div>
    </div>
  `));

  pages.push(p('Part IV · Product Walkthrough', 10, 'How it works · 3–4', `
    <div class="grid-2">
      <div class="card"><div class="big-number">03</div><h3>Selfie A → Selfie B</h3><p>Sequential, real-time capture. Short windows. Liveness-oriented verification in product scope. Media is temporary and recipient-scoped.</p></div>
      <div class="card"><div class="big-number">04</div><h3>Mutual validation</h3><p>Both sides confirm. Only then does a Connection open. Match is impossible without mutual validation — a hard protocol rule.</p></div>
    </div>
  `));

  pages.push(p('Part IV · Product Walkthrough', 11, 'How it works · 5–6', `
    <div class="grid-2">
      <div class="card"><div class="big-number">05</div><h3>Ticket or Mission Meet</h3><p>Meet now — or hold a Ticket (Free up to 2h). No chat until Mission Meet opens. Anti-contact filter blocks phone numbers and social handles in mission messages.</p></div>
      <div class="card"><div class="big-number">06</div><h3>Mission Mode</h3><p>~15 minutes (Free) to coordinate a real-world meet. Short. Single objective. Then the app steps back.</p></div>
    </div>
  `));

  pages.push(p('Part IV · Product Walkthrough', 12, 'How it works · 7–8', `
    <div class="grid-2">
      <div class="card"><div class="big-number">07</div><h3>Outcome</h3><p>Private answers: did you meet? The other person never sees your answer. Used for product learning later — not for public scoreboards.</p></div>
      <div class="card"><div class="big-number">08</div><h3>Cooldown → Radar</h3><p>30 min if any YES / 15 min if both NO or timeout. Then return to Radar. The loop is complete.</p></div>
    </div>
  `));

  pages.push(p('Part IV · Product Walkthrough', 13, 'Show the product', `
    <h1 class="wide">Surface prototype — real UI</h1>
    <div class="phones">
      <div>
        <div class="phone"><img src="../assets/screenshots/01-splash.png" alt="Wingman splash screen"/></div>
        <div class="phone-label">Splash · brand entry</div>
      </div>
      <div>
        <div class="phone"><img src="../assets/screenshots/02-onboarding-problem.png" alt="Wingman onboarding problem screen"/></div>
        <div class="phone-label">Onboarding · the problem</div>
      </div>
    </div>
    <p class="cite" style="text-align:center;margin-top:14px;">Source: live surface client https://wingman-prototype.vercel.app/ · build referenced in operations/FIELD_TEST.md · demo/mock peers possible without Nest API — not Live Field Test Ready.</p>
  `));

  pages.push(p('Part IV · Product Walkthrough', 14, 'Protocol diagram', `
    <h1 class="wide">One intentional loop</h1>
    <img class="diagram" src="../assets/diagrams/protocol-flow.svg" alt="Wingman protocol flow diagram"/>
    <p style="margin-top:16px;">Parallel path (not public core today): Destiny proposal → mutual consent → existing Signal/Connection flow. Destiny remains opt-in, default off, and out of public field test until its own gates.</p>
  `));

  pages.push(p('Part V · Positioning', 15, 'Why this is NOT a dating app', `
    <img class="diagram" src="../assets/diagrams/vs-dating-apps.svg" alt="Wingman versus dating apps"/>
  `));

  pages.push(p('Part V · Positioning', 16, 'Also not a social network', `
    <h1 class="wide">Wingman is a protocol, not a feed</h1>
    <div class="comparison">
      <div class="col them">
        <h3>Social networks</h3>
        <ul>
          <li>Broadcast identity</li>
          <li>Content &amp; followers</li>
          <li>Ambient social graph</li>
          <li>Maximize engagement</li>
        </ul>
      </div>
      <div class="col us">
        <h3>Wingman</h3>
        <ul>
          <li>Controlled disclosure after mutual steps</li>
          <li>No public photo catalogue</li>
          <li>Ephemeral, local interactions</li>
          <li>Maximize real-world first acquaintances</li>
        </ul>
      </div>
    </div>
  `));

  pages.push(p('Part VI · Protocol', 17, 'Wingman Protocol', `
    <h1 class="wide">Server-authoritative connection machine</h1>
    <p class="lead">Clients request transitions. The backend owns timers and terminal states.</p>
    <table class="table">
      <thead><tr><th>State window</th><th>Typical duration</th><th>Notes</th></tr></thead>
      <tbody>
        <tr><td><strong>Signal</strong></td><td>~10 min</td><td>Silent expiry — no rejection push</td></tr>
        <tr><td><strong>Selfie / approval</strong></td><td>5 min (+5 Plus)</td><td>Sequential exchange</td></tr>
        <tr><td><strong>Ticket</strong></td><td>2h Free / 24h Plus</td><td>Hold without chat</td></tr>
        <tr><td><strong>Mission Meet</strong></td><td>15 / 20 min</td><td>Coordinate meet only</td></tr>
        <tr><td><strong>Cooldown</strong></td><td>15–30 min</td><td>Then Radar</td></tr>
      </tbody>
    </table>
    <p class="cite">Source: architecture/STATE_MACHINES.md · packages/domain WingmanEngine</p>
  `));

  pages.push(p('Part VI · Protocol', 18, 'Invariants that make it real', `
    <div class="grid-2">
      <div class="card"><h3>One active connection / user</h3><p>Database-level ActiveUserLock — not UI-only.</p></div>
      <div class="card"><h3>One active Signal / pair</h3><p>No duplicate pressure loops between the same two people.</p></div>
      <div class="card"><h3>Timers never pause offline</h3><p>Absolute expiresAt (UTC). Workers reconcile.</p></div>
      <div class="card"><h3>Block is cross-cutting</h3><p>Removes Radar visibility and closes active protocol paths.</p></div>
    </div>
  `));

  pages.push(p('Part VII · Safety', 19, 'Safety by Design', `
    <h1 class="wide">Safety is a protocol property — not a settings afterthought</h1>
    <div class="grid-3">
      <div class="card"><h3>Consent</h3><p>Per-purpose, append-only, versioned. Core matching rests on contractual necessity — not a single global toggle.</p></div>
      <div class="card"><h3>Mutual steps</h3><p>No connection without mutual validation. Destiny (when enabled) requires separate dual consent.</p></div>
      <div class="card"><h3>Controlled disclosure</h3><p>Name after match path; no public photos; approximate location only to peers.</p></div>
    </div>
    <p class="note">Responsible language: Wingman is designed to reduce risk and friction — it does not guarantee personal safety in the physical world. Meet in public places; trust your judgment.</p>
  `));

  pages.push(p('Part VII · Safety', 20, 'Abuse, report, block', `
    <div class="grid-2">
      <div class="card">
        <h3>User controls <span class="status a">A</span></h3>
        <ul>
          <li>Block — instant, silent to the other party</li>
          <li>Report — can seal session evidence when needed</li>
          <li>Visibility modes — Invisible by default</li>
          <li>Anti-contact filter in Mission chat</li>
        </ul>
      </div>
      <div class="card">
        <h3>System controls <span class="status b">B</span></h3>
        <ul>
          <li>Anti-Abuse engine (observe → graduated policy)</li>
          <li>Shadow mode available before enforcement</li>
          <li>No automatic permanent bans (human review)</li>
          <li>Signal quotas &amp; rate limits</li>
        </ul>
      </div>
    </div>
  `));

  pages.push(p('Part VII · Privacy', 21, 'Privacy architecture', `
    <h1 class="wide">Minimize what must exist</h1>
    <div class="grid-3">
      <div class="card"><h3>Phone</h3><p>Lookup via hashed identity; not shown to other users. Production OTP path still completing Live Field Test gates.</p></div>
      <div class="card"><h3>Location</h3><p>Device has precise GPS. Peers see bands/cells. Exact lat/lng not returned on candidate payloads.</p></div>
      <div class="card"><h3>Selfies</h3><p>Opaque media IDs, short-lived access, private storage model, deletion on expiry — not a public gallery.</p></div>
    </div>
    <p class="cite">Designed to support GDPR-oriented practices; legal review remains required for production claims.</p>
  `));

  pages.push(p('Part VIII · Intelligence', 22, 'Intelligence Layer — honesty first', `
    <h1 class="wide">Advanced engines exist — with flags, baselines, and locks</h1>
    <table class="table">
      <thead><tr><th>Engine</th><th>Role</th><th>Status</th></tr></thead>
      <tbody>
        <tr><td><strong>Radar Intelligence (S21)</strong></td><td>Reorder eligible candidates only</td><td><span class="status b">B Flagged</span></td></tr>
        <tr><td><strong>Context Engine (S22)</strong></td><td>Normalize ephemeral context</td><td><span class="status b">B Flagged</span></td></tr>
        <tr><td><strong>Destiny V2 (S23)</strong></td><td>Rare convergence + dual consent</td><td><span class="status b">B Internal / out of public field</span></td></tr>
        <tr><td><strong>Anti-Abuse (S24)</strong></td><td>Observe → graduated sanctions</td><td><span class="status b">B Flagged</span></td></tr>
        <tr><td><strong>Geo Intelligence (S25)</strong></td><td>Cells/bands, no peer lat/lng</td><td><span class="status b">B Flagged</span></td></tr>
        <tr><td><strong>Measurement (S26)</strong></td><td>Observe only — learning OFF</td><td><span class="status a">A/B On, learning locked</span></td></tr>
      </tbody>
    </table>
  `));

  pages.push(p('Part VIII · Intelligence', 23, 'Destiny — careful truth', `
    <h1>Destiny is not a public core feature today</h1>
    <p class="lead">Implemented behind flags. Default off. Out of public field test until its own gates and DPIA path.</p>
    <div class="grid-2">
      <div class="card"><h3>What it is</h3><p>Detect rare contextual convergence, then require separate consent from both people. Never auto-match. Hands off to the existing V1 Signal → Connection flow.</p></div>
      <div class="card"><h3>What it is not</h3><p>Not a stalking tool. No trajectory, date, or exact address in the user-facing message. Score/reasons stay server-side.</p></div>
    </div>
  `));

  pages.push(p('Part IX · Technology', 24, 'Technology (simplified)', `
    <img class="diagram" src="../assets/diagrams/architecture.svg" alt="Wingman architecture diagram"/>
    <p class="cite">Confirmed stack from repo: NestJS modular monolith · PostgreSQL · Redis · Prisma protocol tables · WebSocket realtime · Twilio SMS + FCM/APNs provider ports · Stripe as billing facts → backend entitlements. Payments currently disabled (PAYMENTS_ENABLED=false).</p>
  `));

  pages.push(p('Part IX · Technology', 25, 'What makes the tech special', `
    <div class="grid-3">
      <div class="card"><h3>Frozen domain</h3><p>S0–S7 WingmanEngine is frozen. Infra wraps protocol — doesn’t rewrite it for convenience.</p></div>
      <div class="card"><h3>Durable vs ephemeral</h3><p>Postgres reconstructs protocol state. Redis holds presence TTL, locks, quotas. Presence never revived from PG.</p></div>
      <div class="card"><h3>Backend V1 GO</h3><p>S20 certification: multi-instance, chaos, races, observability — automated gates passed 2026-08-09.</p></div>
    </div>
  `));

  pages.push(p('Part X · Status Today', 26, 'WHERE WINGMAN IS TODAY', `
    <img class="diagram" src="../assets/diagrams/status-matrix.svg" alt="Wingman status matrix"/>
  `));

  pages.push(p('Part X · Status Today', 27, 'Transparent status matrix', `
    <table class="table">
      <thead><tr><th>Capability</th><th>Label</th><th>Fact</th></tr></thead>
      <tbody>
        <tr><td>Protocol loop (Radar→…→Cooldown)</td><td><span class="status a">A</span></td><td>Domain + Nest API implemented &amp; tested</td></tr>
        <tr><td>Mobile-first UI surface</td><td><span class="status c">C</span></td><td>Walkable on phones; demo mode without public Nest</td></tr>
        <tr><td>Payments / checkout</td><td><span class="status b">B</span></td><td>Architecture ready; disabled fail-closed</td></tr>
        <tr><td>Production SMS OTP</td><td><span class="status c">C</span></td><td>S27B OPEN / deferred (Twilio later)</td></tr>
        <tr><td>Live multi-user field proof</td><td><span class="status c">C</span></td><td>S27A OPEN; S28–S34 queued</td></tr>
        <tr><td>Public Destiny</td><td><span class="status d">D / locked out</span></td><td>Code exists; public field OUT</td></tr>
        <tr><td>Engine learning</td><td><span class="status d">D locked</span></td><td>MEASUREMENT_LEARNING forbidden until review</td></tr>
      </tbody>
    </table>
  `));

  pages.push(p('Part X · Field Test', 28, 'Field Test milestone', `
    <h1 class="wide">From certified backend to real phones</h1>
    <p class="lead">CI green + Vercel ≠ Field Test Ready.</p>
    <div class="card">
      <h3>Definition of Done — Wingman Field Test Ready</h3>
      <p>Two real phones, two real numbers, Signal with app closed on B, real selfie + mutual validation, Mission Meet → Outcome → Radar — without fake users, QA buttons, manual DB, required refresh, or developer help.</p>
    </div>
    <p style="margin-top:16px;" class="mono">S27A → S27B → S28 → S29 → S30 → S31 → S32 → S33 → S34 (GO PILOT / FIX LIST / NO-GO)</p>
  `));

  pages.push(p('Part XI · Monetization', 29, 'How Wingman can monetize', `
    <h1 class="wide">Lean freemium — never ads in the meet flow</h1>
    <div class="grid-2">
      <div class="card"><h3>Free</h3><ul>
        <li>Full Radar</li>
        <li>2 Signals / day</li>
        <li>1 Ticket up to 2h</li>
        <li>Mission Meet 15 min</li>
      </ul></div>
      <div class="card"><h3>Wingman+ · €9.99/mo (spec)</h3><ul>
        <li>20–25 Signals / day (final number TBD)</li>
        <li>2 Tickets up to 24h + renewal</li>
        <li>+5 min windows · Mission 20 min</li>
        <li>Discovery priority (probability, never guaranteed exposure)</li>
      </ul></div>
    </div>
    <p class="cite">Source: docs/BUSINESS_MODEL.md · Payments not live (PAYMENTS_ENABLED=false).</p>
  `));

  pages.push(p('Part XI · Monetization', 30, 'Models A–C', `
    <div class="grid-3">
      <div class="card"><h3>A · Subscription</h3>
        <p><strong>Customer:</strong> frequent users in dense venues.<br/>
        <strong>Value:</strong> more Signals, longer tickets, windows.<br/>
        <strong>Revenue:</strong> Wingman+ monthly.<br/>
        <strong>Why pay:</strong> scarcity hurts when density is high.<br/>
        <strong>Risks:</strong> paywalling safety/consent must never happen.<br/>
        <strong>Validation:</strong> conversion after first successful Mission.</p></div>
      <div class="card"><h3>B · Night / Event Pass</h3>
        <p><strong>Customer:</strong> one night out / festival day.<br/>
        <strong>Value:</strong> temporary entitlement burst.<br/>
        <strong>Revenue:</strong> €2.99 / €4.99 one-time (spec).<br/>
        <strong>Why pay:</strong> tonight matters more than a month.<br/>
        <strong>Risks:</strong> venue dependency; ops complexity.<br/>
        <strong>Validation:</strong> partner nights with density.</p></div>
      <div class="card"><h3>C · Selfie / Rematch SKUs</h3>
        <p><strong>Customer:</strong> users mid-protocol.<br/>
        <strong>Value:</strong> Verified Selfie Cache, Rematch, Cool Down Skip.<br/>
        <strong>Revenue:</strong> micro-purchases (spec).<br/>
        <strong>Why pay:</strong> reduce friction at the last mile.<br/>
        <strong>Risks:</strong> feel pay-to-skip-consent (must not).<br/>
        <strong>Validation:</strong> attach rates post-mutual validation.</p></div>
    </div>
  `));

  pages.push(p('Part XI · Monetization', 31, 'Models D–E + unit economics', `
    <div class="grid-2">
      <div class="card"><h3>D · Venue / event partnerships</h3>
        <p><strong>Customer:</strong> nightlife, campuses, conferences.<br/>
        <strong>Value:</strong> better guest interaction quality.<br/>
        <strong>Revenue:</strong> HYPOTHESIS — sponsorship / Pass distribution.<br/>
        <strong>Risks:</strong> brand association; safety optics.<br/>
        <strong>Validation:</strong> density-first pilots.</p></div>
      <div class="card"><h3>E · Never</h3>
        <p>Boosted profiles · ads in meeting flow · selling behavioral data. Explicitly rejected in product doctrine.</p></div>
    </div>
    <p class="note">Unit economics (CAC, LTV, contribution margin): <strong>HYPOTHESIS TO VALIDATE</strong> — no live revenue; no fabricated fundraising numbers.</p>
  `));

  pages.push(p('Part XII · Growth', 32, 'Go-to-market · density first', `
    <h1 class="wide">Launch where proximity is already true</h1>
    <p class="lead">One dense EU city. Seed events and venues where co-presence is natural.</p>
    <div class="grid-3">
      <div class="card"><h3>1 · Density</h3><p>Campus nights, nightlife corridors, conferences.</p></div>
      <div class="card"><h3>2 · Quality gate</h3><p>Grow only if meeting outcomes hold — not vanity DAU.</p></div>
      <div class="card"><h3>3 · City by city</h3><p>Expand when local Pulse/critical mass is real.</p></div>
    </div>
    <p class="cite">Source: docs/GO_TO_MARKET.md</p>
  `));

  pages.push(p('Part XII · Market', 33, 'Market landscape · careful framing', `
    <h1 class="wide">TAM / SAM / SOM — assumptions labeled</h1>
    <div class="grid-3">
      <div class="card"><h3>TAM</h3><p>Global online dating / social discovery spend is multi‑billion USD depending on definition. Example range cited publicly: ~$6B+ dating-app revenue (2024, Business of Apps via secondary reports) vs narrower Statista definitions — <strong>definitions diverge</strong>.</p></div>
      <div class="card"><h3>SAM</h3><p>EU online dating: public estimates vary (~$0.6B–$1.2B depending on source/year). Wingman is a <em>subset</em>: proximity facilitation, not full swipe market.</p></div>
      <div class="card"><h3>SOM</h3><p><strong>HYPOTHESIS TO VALIDATE</strong>: first-city density cohort (nightlife + campus) — no fabricated user/revenue targets in this deck.</p></div>
    </div>
    <p class="cite">Citations: Pew (usage/experience, US 2022 survey published 2023); Business of Apps / Market Data Forecast / Statista for market sizing — treat as directional, not Wingman revenue.</p>
  `));

  pages.push(p('Part XII · Competitive', 34, 'Competitive landscape', `
    <h1 class="wide">Same desire. Different philosophy.</h1>
    <table class="table">
      <thead><tr><th>Product type</th><th>Core mechanic</th><th>Wingman difference</th></tr></thead>
      <tbody>
        <tr><td><strong>Swipe dating (Tinder/Bumble…)</strong></td><td>Remote catalogue + chat</td><td>Local protocol + capped interaction</td></tr>
        <tr><td><strong>Social networks</strong></td><td>Broadcast &amp; follow</td><td>No public browsing of attraction</td></tr>
        <tr><td><strong>Meetup / events</strong></td><td>Group plans</td><td>Person-to-person first hello</td></tr>
        <tr><td><strong>Proximity experiments</strong></td><td>Vary widely</td><td>Mutual validation + mission timers + silent expiry</td></tr>
      </tbody>
    </table>
    <p>Positioning axes: discreet · private · real-world · non-addictive.</p>
  `));

  pages.push(p('Part XII · Defensibility', 35, 'Defensibility', `
    <div class="grid-2">
      <div class="card"><h3>Current assets</h3><ul>
        <li>Encoded protocol + frozen domain tests</li>
        <li>Backend V1 GO certificate</li>
        <li>Safety/privacy model in product rules</li>
        <li>Advanced engines behind flags + measurement lock</li>
        <li>Clear anti-engagement doctrine</li>
      </ul></div>
      <div class="card"><h3>Potential future moats (not claimed yet)</h3><ul>
        <li>Density network effects in a city</li>
        <li>Trusted brand for first acquaintance</li>
        <li>Venue partnerships</li>
        <li>Learning from real meeting outcomes (after gates)</li>
      </ul></div>
    </div>
  `));

  pages.push(p('Part XIII · Metrics', 36, 'Metrics funnel', `
    <h1 class="wide">North star: confirmed real-world meetings</h1>
    <table class="table">
      <thead><tr><th>Metric</th><th>Definition / target (spec)</th></tr></thead>
      <tbody>
        <tr><td>Signal acceptance</td><td>accepted ÷ received · target &gt;30%</td></tr>
        <tr><td>Selfie response</td><td>returned ÷ received · &gt;60%</td></tr>
        <tr><td>Mutual approval</td><td>approvals ÷ exchanged · &gt;40%</td></tr>
        <tr><td>Mission Mode rate</td><td>entered ÷ connections · &gt;95%</td></tr>
        <tr><td>Meeting confirmation</td><td>“Let’s meet” ÷ Mission opened · &gt;40%</td></tr>
        <tr><td>Meet outcome (indicative)</td><td>meetings ÷ signals · &gt;5%</td></tr>
        <tr><td>Report rate</td><td>reports ÷ active sessions · &lt;0.5%</td></tr>
      </tbody>
    </table>
    <p class="cite">docs/SUCCESS_METRICS.md · S26 baselines observe connection→mission, mission completion, time-to-signal, etc. Learning OFF.</p>
  `));

  pages.push(p('Part XIII · FAQ', 37, 'User FAQ', `
    <dl class="faq">
      <dt>Is Wingman a dating app?</dt>
      <dd>No. It facilitates a first real-world acquaintance for people already nearby.</dd>
      <dt>Will the other person know if I don’t answer?</dt>
      <dd>Signals expire silently. No rejection notification.</dd>
      <dt>Does it share my exact location?</dt>
      <dd>Peers see approximate bands — not exact coordinates.</dd>
      <dt>How many Signals do I get?</dt>
      <dd>Free: 2 per day. Plus (when payments live): 20–25 per day per spec.</dd>
      <dt>Is Destiny on?</dt>
      <dd>Off by default; not part of public field test until separate gates.</dd>
      <dt>Does Wingman guarantee safety?</dt>
      <dd>No app can. Wingman designs for consent, privacy, and controls — meet carefully in public.</dd>
    </dl>
  `));

  pages.push(p('Part XIV · Investor narrative', 38, 'Investor narrative · 01–10', `
    <ol class="checklist">
      <li>Human problem: the first hello is expensive.</li>
      <li>Wrong tools dominate: swipe &amp; social maximize engagement.</li>
      <li>Wingman thesis: proximity + mutual consent + short protocol.</li>
      <li>Product doctrine rejects addiction mechanics.</li>
      <li>Core loop is implemented as a frozen domain engine.</li>
      <li>Backend V1 certified GO (S20).</li>
      <li>Advanced intelligence exists but is flagged and measured without learning.</li>
      <li>UI surface exists; live multi-user proof is the next critical path.</li>
      <li>Monetization is designed, payments fail-closed until ready.</li>
      <li>GTM is density-first, quality-gated.</li>
    </ol>
  `));

  pages.push(p('Part XIV · Investor narrative', 39, 'Investor narrative · 11–20', `
    <ol class="checklist" start="11">
      <li>Safety/privacy are product invariants, not marketing stickers.</li>
      <li>Destiny is powerful — and deliberately gated.</li>
      <li>Competitive edge is philosophy + protocol encoding.</li>
      <li>Market is large; Wingman’s wedge is narrower and more honest.</li>
      <li>Key risk: density cold-start — must be designed around.</li>
      <li>Key risk: trust/safety incidents — mitigated by design + ops.</li>
      <li>Key risk: confusing positioning as “another dating app.”</li>
      <li>Near-term value creation: Field Test Ready → pilot city.</li>
      <li>What to prove next: real OTP, realtime, selfie, closed-app Signal.</li>
      <li><strong>FUNDING SCENARIO — TO BE DEFINED</strong> (no fabricated raise/revenue).</li>
    </ol>
  `));

  pages.push(p('Part XIV · Product Owner', 40, 'Igor / Product Owner view', `
    <h1 class="wide">Decision gates, not vibes</h1>
    <div class="grid-2">
      <div class="card"><h3>Designed / Implemented / Certified</h3>
        <p>Spec V4.1 · Domain S0–S7 frozen · Envelope S8–S19 · S20 Backend V1 GO · V1.1 engines S21–S26 done with learning OFF.</p></div>
      <div class="card"><h3>Field-tested / Locked</h3>
        <p>Surface UI ready. Live Field Test track locked. Payments OFF. Public Destiny OUT. No new engines. Polish-by-habit stopped.</p></div>
    </div>
    <p class="note">Governance: Observer → Measure → Decide → Ticket (only with objectified facts) → Correct → Validate → Document.</p>
  `));

  pages.push(p('Part XV · Roadmap', 41, 'Roadmap from actual docs', `
    <table class="table">
      <thead><tr><th>Track</th><th>Status</th></tr></thead>
      <tbody>
        <tr><td>Backend V1 S0–S20</td><td><strong>GO / frozen</strong></td></tr>
        <tr><td>V1.1 engines S21–S26</td><td><strong>Done</strong> — engine sprints stopped; baselines</td></tr>
        <tr><td>Client UI + payment readiness</td><td><strong>Done</strong> — payments disabled</td></tr>
        <tr><td>Live Field Test S27–S34</td><td><strong>Active</strong> — S27A OPEN</td></tr>
        <tr><td>S26 Review → engine learning</td><td><strong>Not automatic</strong></td></tr>
        <tr><td>Payments go-live</td><td>Sandbox cert → then flag true</td></tr>
        <tr><td>Public Destiny</td><td>Post DPIA / own gates</td></tr>
      </tbody>
    </table>
  `));

  pages.push(p('Part XV · Vision', 42, 'Long-term vision · labeled VISION', `
    <h1 class="wide">VISION — not current fact</h1>
    <p class="lead">Become the trusted, discreet layer for the first acquaintance — recognizable by calm, private, magnetic character rather than loud catalogues.</p>
    <div class="grid-2">
      <div class="card"><h3>Possible future</h3><ul>
        <li>Multi-city density networks</li>
        <li>Venue-native facilitation</li>
        <li>Outcome-trained intelligence (after ethics/gates)</li>
        <li>Category-defining “permission protocol”</li>
      </ul></div>
      <div class="card"><h3>What must stay true</h3><ul>
        <li>Real meetings over engagement</li>
        <li>Consent and privacy as product law</li>
        <li>No ads in the meeting flow</li>
        <li>Honesty about what is built vs dreamed</li>
      </ul></div>
    </div>
    <p style="margin-top:20px;" class="tagline">Make the first acquaintance easy.</p>
  `));

  return pages;
}

export const MASTER_TOTAL = TOTAL;
