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
   - `guestList` is an optional curated set of names baked in at build
     time, same idea as `photos`. Every concert page also has a live
     "Add me" box (see "Guest list" below) that anyone can use to add
     themselves — that's the primary way names end up on the list.
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
npx wrangler kv key get "photos:<slug>" --namespace-id b2ab1b313530474badeb59b40fb318d6 --remote
npx wrangler kv key put "photos:<slug>" '<edited JSON array>' --namespace-id b2ab1b313530474badeb59b40fb318d6 --remote
```

## Guest list

Every concert page also has a live "Add me" box — anyone can type their
name and add themselves to that show's guest list, no login required.
The list is shared across the whole site: if the same name (matched
case-insensitively) gets added to more than one show, a badge appears
next to their name showing the running total of shows they've been added
to, e.g. "3 shows". This uses the same Worker and KV namespace as photo
uploads (`guests:<slug>` for each show's list, `guesttotal:<name>` for
the per-person running total), rate-limited to ~30 additions/hour per IP.

Because it's open to anyone, there's no public rename/delete endpoint.
To fix a typo'd or unwanted name:

```
npx wrangler kv key get "guests:<slug>" --namespace-id b2ab1b313530474badeb59b40fb318d6 --remote
npx wrangler kv key put "guests:<slug>" '<edited JSON array>' --namespace-id b2ab1b313530474badeb59b40fb318d6 --remote
```

Adjusting their total (or removing it entirely) means editing the
matching `guesttotal:<lowercase-name>` key the same way — its value is
`{"name": "...", "count": N}`.

To change upload/guest limits or validation, edit `worker/src/index.js`
and redeploy:

```
cd worker
npx wrangler deploy
```

The Worker is authenticated via `wrangler login` under the Cloudflare
account that also manages `cuzbro.net`'s DNS — the R2 custom domain and
the Worker's custom domain routes were both created against that same
zone, so nothing else needs configuring on the DNS side for this feature.

## Admin — music set uploads

`ashton.cuzbro.net/admin` ("Backstage") is a login-gated page for uploading
full-length show recordings, which then appear as downloads on that show's
"Music Set" section for anyone to grab — no login needed to download, only
to upload.

Login is the **same account as cuzbro.net** — it authenticates against the
same Supabase project (`supabase.js` client, same URL/anon key baked into
`assets/js/admin.js`). Access is granted to anyone with
`app_metadata.role === "admin"` on that Supabase project (Dave, Justin,
Chappy) or the shared `guest@cuzbro.net` account — the same admin role
cuzbro.net itself checks. There's no separate password to manage; adding or
removing an admin means editing `auth.users` in the shared Supabase project
(see `c:\cuzbro\supabase\guest-access-setup.sql` for how that's done), not
anything in this repo.

Because recordings can be large (hundreds of MB to a couple GB), uploads
are chunked automatically: the browser splits the file into 40MB pieces
and uploads each as a separate request using
[R2's multipart upload API](https://developers.cloudflare.com/r2/objects/multipart-objects/)
(`worker/src/index.js`'s `sets/init` → `sets/part` (× N) → `sets/complete`
endpoints), so no single request ever needs to carry the whole file. The
admin page also shows a running total of R2 storage used across the whole
project (photos + sets), since R2's free tier is 10GB.

Everything except downloading is auth-checked server-side in the Worker:
each admin request carries `Authorization: Bearer <Supabase access token>`,
and the Worker calls Supabase's `/auth/v1/user` endpoint to verify the
token and check the role before touching R2/KV — a client-side check alone
wouldn't be enough, since anyone can read the JS.

To remove a set manually (bypassing the admin UI):

```
cd worker
npx wrangler r2 object delete "ashton-40-photos/<key-from-the-set-url>" --remote
npx wrangler kv key get "sets:<slug>" --namespace-id b2ab1b313530474badeb59b40fb318d6 --remote
npx wrangler kv key put "sets:<slug>" '<edited JSON array>' --namespace-id b2ab1b313530474badeb59b40fb318d6 --remote
```

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
