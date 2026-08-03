# 40 Before 40

Ashton's concert log — chasing 40 shows in the year before turning 40.

Plain static site (HTML/CSS/JS, no framework). A small Node script
(`build.js`) generates the homepage and every concert page from the data
files in `data/`, so adding a show never means hand-writing HTML.

## Adding a concert

1. Add a cover photo to `assets/img/concerts/` (any image format works).
2. Open `data/concerts.json` and add a new entry:

   ```json
   {
     "number": 8,
     "slug": "band-name-venue",
     "band": "Band Name",
     "showTitle": "Optional subtitle, e.g. Night One",
     "venue": "Venue Name",
     "city": "City, ST",
     "date": "2026-10-05",
     "rating": 5,
     "price": "$40",
     "photo": "assets/img/concerts/your-cover-photo.jpg",
     "photos": [
       { "src": "assets/img/concerts/show8-1.jpg", "caption": "Optional caption" },
       { "src": "assets/img/concerts/show8-2.jpg", "caption": "" }
     ],
     "guestList": ["Friend One", "Friend Two"],
     "supportActs": ["Opener One"],
     "highlight": "One or two sentences for the pull-quote box.",
     "notes": "The longer writeup / recap for the show.",
     "setlist": {
       "set1": ["Song One", "Song Two"],
       "set2": ["Song Three"],
       "encore": ["Song Four"]
     },
     "setlistSource": "https://www.setlist.fm/setlist/..."
   }
   ```

   - `number` sets show order and which slot it fills in the 1–40 grid.
   - `slug` becomes the URL: `concerts/band-name-venue.html`.
   - `photo` is the cover image used on the homepage stub and the concert
     page hero. `photos` is a curated set baked in at build time — drop
     image files in `assets/img/concerts/` and list them here (`caption`
     is optional), or leave it as `[]`. Either way, every concert page also
     has a live drag-and-drop uploader (see "Photo uploads" below) that
     visitors can use to add more photos on their own, on top of whatever's
     in `photos`.
   - `guestList` is who Ashton brought along — shown as a row of chips on
     the concert page. Leave it as `[]` and the page shows a placeholder
     prompting you to fill it in.
   - `rating` is 1–5 (whole numbers) and drives the star display.
   - `showTitle`, `supportActs`, `price`, `highlight`, `notes`, `setlist`,
     and `setlistSource` are all optional — omit or leave empty and
     they're skipped automatically.

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
  until 40" countdown on the homepage.
- `challengeStart` — when the 40-show year began.
- `goal` — defaults to 40; change if the target ever changes.
- `personName`, `tagline`, `siteName` — copy shown across the site.

Re-run `node build.js` after any change here too.

## Site branding

The "Ashton's 40 for 40 Tour" crest lives at `assets/img/branding/logo.png`
and is used in the header and the homepage hero. Swap that file (keep the
same filename) to update the logo everywhere without touching `build.js`.

## Photo uploads

Every concert page has a live drag-and-drop photo uploader — anyone
visiting the site can drop photos onto a show's page and they show up in
that show's gallery for everyone, no login required. This runs on
Cloudflare, separate from the static site:

- **R2 bucket** `ashton-40-photos` stores the uploaded image files, served
  publicly and directly (no Worker in the read path) at
  `https://ashton-media.cuzbro.net`.
- **Worker** `ashton-photos-api` (`worker/`) is the upload API, deployed at
  `https://ashton-api.cuzbro.net`. It validates uploads (JPEG/PNG/WEBP/GIF
  only, 8MB max, 100 photos max per show, ~20 uploads/hour per IP), writes
  the file to R2, and records `{key, caption, uploadedAt}` per show in the
  **KV namespace** `ASHTON_PHOTOS_KV`.
- **Client** (`assets/js/gallery.js`) fetches each show's photo list from
  the Worker on page load and renders it into the gallery, and turns file
  drops / the "browse" button into `POST` requests to the same API.

Because uploads are fully open (anyone, no auth), there's no delete
endpoint exposed publicly on purpose. To remove an inappropriate or
unwanted photo:

```
cd worker
npx wrangler r2 object delete "ashton-40-photos/<key-from-the-photo-url>" --remote
```

Then also drop that entry from the show's list in KV — read it, edit out
the entry, write it back:

```
npx wrangler kv key get "show:<slug>" --namespace-id b2ab1b313530474badeb59b40fb318d6 --remote
npx wrangler kv key put "show:<slug>" '<edited JSON array>' --namespace-id b2ab1b313530474badeb59b40fb318d6 --remote
```

To change upload limits or validation, edit `worker/src/index.js` and
redeploy:

```
cd worker
npx wrangler deploy
```

The Worker is authenticated via `wrangler login` under the Cloudflare
account that also manages `cuzbro.net`'s DNS — the R2 custom domain and
the Worker's custom domain routes were both created against that same
zone, so nothing else needs configuring on the DNS side for this feature.

## Deploying to GitHub Pages (ashton.cuzbro.net)

Already set up: the site is pushed to
[github.com/Mufgusnut/ashton](https://github.com/Mufgusnut/ashton) on the
`master` branch, GitHub Pages serves from the repo root, and the custom
domain `ashton.cuzbro.net` is configured (via the committed `CNAME` file).

Every subsequent update is:

```
node build.js
git add -A
git commit -m "..."
git push
```

If this ever needs to be re-deployed to a fresh repo, the steps are:
create a public GitHub repo, push this folder to its default branch,
enable Pages (source: deploy from branch, root), set the custom domain to
`ashton.cuzbro.net`, and add a CNAME record at the DNS provider for
`cuzbro.net`: `ashton` → `<github-username>.github.io` (DNS-only, not
proxied, until GitHub issues the HTTPS certificate).
