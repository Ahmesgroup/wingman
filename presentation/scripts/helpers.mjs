/** Shared HTML helpers for Wingman presentation decks */
export function pageShell({ part, num, total, title, body, compact = false }) {
  return `
<section class="page${compact ? ' compact' : ''}">
  <div class="page-header">
    <div class="brand-mark"><span class="brand-dot"></span>Wingman</div>
    <div class="part-label">${part || ''}</div>
  </div>
  <div class="page-body">
    ${title ? `<div class="eyebrow">${title}</div>` : ''}
    ${body}
  </div>
  <div class="page-footer">
    <span>Make the first acquaintance easy.</span>
    <span>${num} / ${total}</span>
  </div>
</section>`;
}

export function coverPage({ subtitle, deck, total, confidential = true }) {
  return `
<section class="page">
  <div class="page-body hero-center">
    <div class="cover-logo" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="8" stroke="#B9A7FF" stroke-width="2"/>
        <circle cx="24" cy="24" r="15" stroke="#7C5CFC" stroke-width="2" opacity="0.7"/>
        <circle cx="24" cy="24" r="3" fill="#7C5CFC"/>
      </svg>
    </div>
    <div class="tagline">Make the first acquaintance easy.</div>
    <h1 class="wide" style="margin-top:18px;font-size:72px;">Wingman</h1>
    <p class="lead">${subtitle}</p>
    <div class="pill-row">
      <span class="status a">Social Interaction Facilitation Technology</span>
      <span class="status b">Not a dating app</span>
      <span class="status c">${deck}</span>
    </div>
    <p class="tiny" style="margin-top:28px;">Product Owner: Igor Chernikov · Spec V3.1 · Prepared for investors, partners &amp; users<br/>
    ${confidential ? 'Confidential — factual status as of August 2026 repository documentation.' : ''}
    </p>
  </div>
  <div class="page-footer">
    <span>Love is in the air.</span>
    <span>1 / ${total}</span>
  </div>
</section>`;
}

export function htmlDoc(title, cssRel, pagesHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
  <link rel="stylesheet" href="${cssRel}"/>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}
