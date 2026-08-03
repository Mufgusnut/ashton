# 40 Before 40

Ashton's concert log — chasing 40 shows in the year before turning 40.

Plain static site (HTML/CSS/JS, no framework). A small Node script
(`build.js`) generates the homepage and every concert page from the data
files in `data/`, so adding a show never means hand-writing HTML.

## Adding a concert

1. Add a photo to `assets/img/concerts/` (any image format works).
2. Open `data/concerts.json` and add a new entry:

   ```json
   {
     "number": 4,
     "slug": "band-name-venue",
     "band": "Band Name",
     "supportActs": ["Opener One"],
     "venue": "Venue Name",
     "city": "City, ST",
     "date": "2026-10-05",
     "rating": 5,
     "price": "$40",
     "photo": "assets/img/concerts/your-photo.jpg",
     "gallery": [],
     "highlight": "One or two sentences for the pull-quote box.",
     "notes": "The longer writeup / recap for the show."
   }
   ```

   - `number` sets show order and which slot it fills in the 1–40 grid.
   - `slug` becomes the URL: `concerts/band-name-venue.html`.
   - `rating` is 1–5 (whole numbers) and drives the star display and the
     "favorite show" callout on the homepage.
   - `supportActs`, `gallery`, `price`, and `highlight` are optional — omit
     or leave empty and they're skipped automatically.

3. Rebuild the site:

   ```
   node build.js
   ```

   This regenerates `index.html` and every file in `concerts/`. Never edit
   those generated files by hand — they'll be overwritten on the next build.

4. Preview locally before pushing (any static file server works), e.g.:

   ```
   npx serve .
   ```

## Editing site-wide info

`data/config.json` controls the header, hero copy, and countdown:

- `birthday` — the 40th birthday date (`YYYY-MM-DD`). Drives the "days
  until 40" countdown on the homepage. **Update this before launch** —
  it's currently a placeholder.
- `challengeStart` — when the 40-show year began.
- `goal` — defaults to 40; change if the target ever changes.
- `personName`, `tagline`, `siteName` — copy shown across the site.

Re-run `node build.js` after any change here too.

## Deploying to GitHub Pages (ashton.cuzbro.net)

1. Create a new GitHub repo and push this folder to it (`main` branch).
2. In the repo: **Settings → Pages → Build and deployment → Source** →
   `Deploy from a branch`, branch `main`, folder `/ (root)`.
3. Still on that page, set **Custom domain** to `ashton.cuzbro.net` and
   save — this writes the `CNAME` file already committed here as the
   source of truth. GitHub will run a DNS check.
4. At whoever manages DNS for `cuzbro.net`, add a CNAME record:

   ```
   ashton.cuzbro.net.   CNAME   <github-username>.github.io.
   ```

5. Once DNS propagates, check "Enforce HTTPS" back in the Pages settings.

The site is plain static output, so every subsequent update is just:
edit `data/concerts.json` → `node build.js` → commit → push.
