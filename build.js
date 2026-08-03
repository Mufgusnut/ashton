#!/usr/bin/env node
/*
 * Static site generator for the "40 Before 40" concert log.
 * Reads data/config.json + data/concerts.json and writes index.html
 * plus one concerts/<slug>.html per show. No dependencies, no build tool
 * beyond `node build.js`.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/config.json'), 'utf8'));
const concerts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/concerts.json'), 'utf8'))
  .slice()
  .sort((a, b) => a.number - b.number);

// ---------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function stars(rating) {
  const full = Math.max(0, Math.min(5, Math.round(rating || 0)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

// ---------------------------------------------------------------------
// derived stats
// ---------------------------------------------------------------------

const totalShows = concerts.length;
const goal = config.goal;
const cities = new Set(concerts.map((c) => c.city));
const bands = new Set(concerts.map((c) => c.band));
const setlistSongCount = (concert) => {
  if (!concert.setlist) return 0;
  const { set1 = [], set2 = [], encore = [] } = concert.setlist;
  return set1.length + set2.length + encore.length;
};
const totalSongs = concerts.reduce((sum, c) => sum + setlistSongCount(c), 0);
const progressPct = goal ? Math.round((totalShows / goal) * 100) : 0;

// ---------------------------------------------------------------------
// shared chrome
// ---------------------------------------------------------------------

function head(title, description, prefix) {
  return `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${prefix}${config.socialImage}">
  <meta property="og:type" content="website">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bungee&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${prefix}assets/css/style.css">`;
}

function header(prefix) {
  return `<header class="site-header">
    <div class="wrap">
      <a class="brand" href="${prefix}index.html">
        <img class="brand-logo" src="${prefix}assets/img/branding/logo.png" alt="${escapeHtml(config.personName)}'s 40 for 40 Tour">
        <span class="brand-word">${escapeHtml(config.personName)}<span>${goal}</span></span>
      </a>
      <nav class="site-nav">
        <a href="${prefix}index.html">Home</a>
        <a href="${prefix}index.html#shows">All Shows</a>
      </nav>
    </div>
  </header>`;
}

function footer(prefix) {
  return `<footer class="site-footer">
    <div class="wrap" style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:12px;">
      <span>${escapeHtml(config.siteName)} &mdash; ${escapeHtml(config.domain)}</span>
      <span>${totalShows} of ${goal} shows logged</span>
    </div>
  </footer>`;
}

function page(title, description, prefix, bodyHtml, extraScripts) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${head(title, description, prefix)}
</head>
<body>
  ${header(prefix)}
  ${bodyHtml}
  ${footer(prefix)}
  ${extraScripts || ''}
</body>
</html>
`;
}

// ---------------------------------------------------------------------
// homepage
// ---------------------------------------------------------------------

function renderStub(concert) {
  if (!concert) return '';
  return `<a class="stub filled" href="concerts/${concert.slug}.html">
    <div class="thumb">
      <img src="${concert.photo}" alt="${escapeHtml(concert.band)} at ${escapeHtml(concert.venue)}" loading="lazy">
      <span class="num-badge">#${concert.number}</span>
      ${concert.rating ? `<span class="rating">${stars(concert.rating)}</span>` : ''}
    </div>
    <div class="body">
      <div class="band">${escapeHtml(concert.band)}</div>
      ${concert.showTitle ? `<div class="show-title-tag">${escapeHtml(concert.showTitle)}</div>` : ''}
      <div class="meta"><strong>${escapeHtml(concert.venue)}</strong><br>${escapeHtml(concert.city)} &middot; ${fmtDate(concert.date)}</div>
    </div>
  </a>`;
}

function renderEmptyStub(number) {
  return `<div class="stub empty">
    <div class="placeholder-wrap">
      <div class="placeholder-num">#${number}</div>
      <div class="placeholder-label">TBD</div>
    </div>
  </div>`;
}

function renderIndex() {
  const byNumber = new Map(concerts.map((c) => [c.number, c]));
  const slots = [];
  for (let n = 1; n <= goal; n += 1) {
    slots.push(byNumber.has(n) ? renderStub(byNumber.get(n)) : renderEmptyStub(n));
  }

  const body = `
  <section class="hero">
    <div class="wrap">
      <div class="hero-grid">
        <img class="hero-logo" src="assets/img/branding/logo.png" alt="${escapeHtml(config.personName)}'s 40 for 40 Tour, ${fmtDate(config.challengeStart)} to ${fmtDate(config.birthday)}">
        <div>
          <span class="eyebrow">${escapeHtml(config.tagline)}</span>
          <p class="tagline">Follow ${escapeHtml(config.personName)}'s year-long chase to see ${goal} concerts before turning ${goal} &mdash; every show, every venue, every story along the way.</p>
        </div>
      </div>

      <div class="hero-stats">
        <div class="stat-block">
          <div class="num">${totalShows}/${goal}</div>
          <div class="label">Shows Logged</div>
        </div>
        <div class="stat-block">
          <div class="num">${cities.size}</div>
          <div class="label">Cities</div>
        </div>
        <div class="stat-block">
          <div class="num">${totalSongs}</div>
          <div class="label">Songs Heard</div>
        </div>
        <div class="stat-block">
          <div class="num" id="countdown-caption" data-birthday="${config.birthday}">&hellip;</div>
          <div class="label">Until 40</div>
        </div>
      </div>

      <div class="progress-track">
        <div class="progress-bar"><div class="progress-bar-fill" style="width:${progressPct}%"></div></div>
        <div class="progress-caption">
          <span>${totalShows} of ${goal} shows down</span>
          <span>${progressPct}%</span>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="shows">
    <div class="wrap">
      <div class="section-head">
        <h2>The Shows</h2>
        <span class="sub">${totalShows ? `${bands.size} band${bands.size === 1 ? '' : 's'} across ${cities.size} cit${cities.size === 1 ? 'y' : 'ies'} so far` : 'No shows logged yet'}</span>
      </div>
      <div class="concert-grid">
        ${slots.join('\n        ')}
      </div>
    </div>
  </section>`;

  const extraScript = `<script src="assets/js/main.js"></script>`;
  return page(
    config.siteName,
    `${config.personName}'s year of chasing ${goal} concerts before turning ${goal}.`,
    '',
    body,
    extraScript,
  );
}

// ---------------------------------------------------------------------
// concert detail pages
// ---------------------------------------------------------------------

function renderSetlistColumn(title, songs) {
  if (!songs || !songs.length) return '';
  return `<div class="setlist-col">
      <h3>${escapeHtml(title)}</h3>
      <ol>
        ${songs.map((song) => `<li>${escapeHtml(song)}</li>`).join('\n        ')}
      </ol>
    </div>`;
}

function renderSetlist(concert) {
  if (!concert.setlist) return '';
  const { set1, set2, encore } = concert.setlist;
  const columns = [
    renderSetlistColumn(set2 && set2.length ? 'Set 1' : 'Setlist', set1),
    renderSetlistColumn('Set 2', set2),
    renderSetlistColumn('Encore', encore),
  ].filter(Boolean).join('\n    ');

  if (!columns) return '';

  return `<section class="wrap setlist-section">
    <div class="section-head">
      <h2>Setlist</h2>
      ${concert.setlistSource ? `<span class="sub"><a href="${escapeHtml(concert.setlistSource)}" target="_blank" rel="noopener">via setlist.fm &nearr;</a></span>` : ''}
    </div>
    <div class="setlist-grid">
    ${columns}
    </div>
  </section>`;
}

function renderGallery(concert) {
  const photos = concert.photos || [];

  const items = photos.map((p) => {
    const src = typeof p === 'string' ? `../${p}` : `../${p.src}`;
    const caption = typeof p === 'string' ? '' : (p.caption || '');
    return `<figure class="gallery-item">
        <img src="${src}" alt="${escapeHtml(caption || concert.band)}" loading="lazy">
        ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
      </figure>`;
  }).join('\n      ');

  return `<section class="wrap gallery-section">
    <div class="section-head">
      <h2>Photos</h2>
      <span class="sub" id="gallery-count"></span>
    </div>
    <div class="gallery-grid" id="gallery-grid">
      ${items}
    </div>
    <div class="gallery-empty" id="gallery-empty" ${photos.length ? 'style="display:none"' : ''}>
      <div class="gallery-empty-icon">&#128247;</div>
      <p>No photos yet. Be the first to drop one in below.</p>
    </div>
    <div class="dropzone" id="dropzone" data-slug="${escapeHtml(concert.slug)}" data-api-base="${escapeHtml(config.photosApiBase)}">
      <input type="file" id="file-input" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden>
      <div class="dropzone-content">
        <div class="dropzone-icon">&#8593;</div>
        <p><strong>Drag photos here</strong> or <button type="button" class="dropzone-browse">browse</button></p>
        <p class="dropzone-hint">JPEG, PNG, WEBP, or GIF &middot; 8MB max</p>
      </div>
      <div class="dropzone-status" id="dropzone-status"></div>
    </div>
  </section>`;
}

function renderGuestList(concert) {
  const guests = concert.guestList || [];

  const chips = guests.map((name) => `<span class="guest-chip">${escapeHtml(name)}</span>`).join('\n      ');

  return `<section class="wrap guest-list-section">
    <div class="section-head">
      <h2>Guest List</h2>
      <span class="sub" id="guest-count"></span>
    </div>
    <div class="guest-list" id="guest-list">
      ${chips}
    </div>
    <div class="guest-list-empty" id="guest-list-empty" ${guests.length ? 'style="display:none"' : ''}>
      No one on the list yet &mdash; add your name below.
    </div>
    <form class="guest-form" id="guest-form" data-slug="${escapeHtml(concert.slug)}" data-api-base="${escapeHtml(config.photosApiBase)}">
      <input type="text" id="guest-name-input" name="name" placeholder="Your name" maxlength="60" autocomplete="name">
      <button type="submit" class="guest-submit">Add me</button>
    </form>
    <div class="guest-form-status" id="guest-form-status"></div>
  </section>`;
}

function renderConcertPage(concert, prev, next) {
  const support = concert.supportActs && concert.supportActs.length
    ? concert.supportActs.join(', ')
    : null;

  const body = `
  <section class="concert-hero">
    <div class="wrap">
      <a class="back-link" href="../index.html#shows">&larr; All Shows</a>
      <div class="concert-hero-grid">
        <div>
          <div class="show-number">Show #${concert.number} of ${goal}</div>
          <h1>${escapeHtml(concert.band)}</h1>
          ${concert.showTitle ? `<div class="show-subtitle">${escapeHtml(concert.showTitle)}</div>` : ''}

          <div class="concert-facts">
            <div class="fact">
              <div class="label">Venue</div>
              <div class="value">${escapeHtml(concert.venue)}</div>
            </div>
            <div class="fact">
              <div class="label">City</div>
              <div class="value">${escapeHtml(concert.city)}</div>
            </div>
            <div class="fact">
              <div class="label">Date</div>
              <div class="value">${fmtDate(concert.date)}</div>
            </div>
            ${concert.rating ? `<div class="fact"><div class="label">Rating</div><div class="value stars">${stars(concert.rating)}</div></div>` : ''}
            ${support ? `<div class="fact"><div class="label">Support</div><div class="value">${escapeHtml(support)}</div></div>` : ''}
            ${concert.price ? `<div class="fact"><div class="label">Price</div><div class="value">${escapeHtml(concert.price)}</div></div>` : ''}
          </div>

          ${concert.highlight ? `<div class="highlight-box">${escapeHtml(concert.highlight)}</div>` : ''}
        </div>
        <div class="concert-photo">
          <img src="../${concert.photo}" alt="${escapeHtml(concert.band)} at ${escapeHtml(concert.venue)}">
        </div>
      </div>
    </div>
  </section>

  ${concert.notes ? `<section class="wrap notes"><h2>Notes</h2><p>${escapeHtml(concert.notes)}</p></section>` : ''}

  ${renderSetlist(concert)}

  ${renderGuestList(concert)}

  ${renderGallery(concert)}

  <div class="wrap">
    <div class="concert-nav">
      <a class="prev" href="${prev ? `${prev.slug}.html` : '#'}" ${prev ? '' : 'style="visibility:hidden"'}>
        <div class="dir">&larr; Previous</div>
        <div>${prev ? `#${prev.number} ${escapeHtml(prev.band)}` : ''}</div>
      </a>
      <a class="next" href="${next ? `${next.slug}.html` : '#'}" ${next ? '' : 'style="visibility:hidden"'}>
        <div class="dir">Next &rarr;</div>
        <div>${next ? `#${next.number} ${escapeHtml(next.band)}` : ''}</div>
      </a>
    </div>
  </div>`;

  return page(
    `${concert.band} — Show #${concert.number} | ${config.siteName}`,
    `${concert.band} at ${concert.venue}, ${concert.city} on ${fmtDate(concert.date)}.`,
    '../',
    body,
    `<script src="../assets/js/gallery.js"></script>
    <script src="../assets/js/guestlist.js"></script>`,
  );
}

// ---------------------------------------------------------------------
// write output
// ---------------------------------------------------------------------

fs.writeFileSync(path.join(ROOT, 'index.html'), renderIndex());

const concertsDir = path.join(ROOT, 'concerts');
if (!fs.existsSync(concertsDir)) fs.mkdirSync(concertsDir, { recursive: true });

concerts.forEach((concert, i) => {
  const prev = concerts[i - 1] || null;
  const next = concerts[i + 1] || null;
  fs.writeFileSync(
    path.join(concertsDir, `${concert.slug}.html`),
    renderConcertPage(concert, prev, next),
  );
});

console.log(`Built index.html and ${concerts.length} concert page(s).`);
