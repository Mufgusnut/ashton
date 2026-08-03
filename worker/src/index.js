/*
 * Photo + guest-list + music-set API for the "40 Before 40" concert site.
 *
 * Public (no auth):
 * - GET  /api/concerts/:slug/photos   -> list photos for a show
 * - POST /api/concerts/:slug/photos   -> upload a photo (multipart: file, caption?)
 * - GET  /api/all-photos              -> list every uploaded photo across all shows,
 *                                        each tagged with its show's slug
 * - GET  /api/concerts/:slug/guests   -> list guests for a show, each with their
 *                                        running total of shows attended with Ashton
 * - POST /api/concerts/:slug/guests   -> add a name to a show's guest list (json: {name})
 * - GET  /api/guests/:name/shows      -> list every show slug that name appears on
 * - GET  /api/concerts/:slug/sets     -> list downloadable music sets for a show
 *
 * Admin only (Authorization: Bearer <Supabase access token>, same Supabase
 * project as cuzbro.net; requires app_metadata.role === 'admin' or the
 * shared guest@cuzbro.net account):
 * - POST   /api/admin/concerts/:slug/sets/init      -> start a chunked file upload
 * - PUT    /api/admin/concerts/:slug/sets/part      -> upload one chunk
 * - POST   /api/admin/concerts/:slug/sets/complete  -> finish a chunked file upload
 * - POST   /api/admin/concerts/:slug/sets/abort     -> cancel an in-progress upload
 * - POST   /api/admin/concerts/:slug/sets/link      -> add a set that just links
 *                                                      elsewhere (json: {url, label})
 * - DELETE /api/admin/concerts/:slug/sets           -> remove a set (json: {id})
 * - GET    /api/admin/storage-usage                 -> total R2 bytes used
 *
 * Storage:
 * - R2: binary files, served publicly & directly at MEDIA_BASE_URL (not via this Worker).
 *   Photos live under `concerts/{slug}/...`, music sets under `sets/{slug}/...`.
 * - KV `photos:{slug}`        -> JSON array of {key, caption, uploadedAt}
 * - KV `guests:{slug}`        -> JSON array of display names on that show's guest list
 * - KV `guesttotal:{normalized-name}` -> JSON {name, count} — count of distinct shows
 *   that person has been added to, across the whole site.
 * - KV `sets:{slug}`          -> JSON array of set records, each either
 *   {id, type:"file", key, filename, label, sizeBytes, uploadedAt, uploadedBy} or
 *   {id, type:"link", url, label, uploadedAt, uploadedBy}
 */

const SLUG_RE = /^[a-z0-9-]{1,80}$/;
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_PHOTOS_PER_SHOW = 100;
const MAX_GUESTS_PER_SHOW = 200;
const MAX_NAME_LENGTH = 60;
const UPLOAD_RATE_LIMIT_PER_HOUR = 20;
const GUEST_RATE_LIMIT_PER_HOUR = 30;
const GUEST_ADMIN_EMAIL = 'guest@cuzbro.net';

const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const ALLOWED_AUDIO_EXT = ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'aac', 'wma', 'aiff'];

function corsHeaders(request, env) {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

async function rateLimitOk(env, bucket, ip, limit) {
  const hourBucket = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const key = `rl:${bucket}:${ip}:${hourBucket}`;
  const current = parseInt((await env.PHOTOS_KV.get(key)) || '0', 10);
  if (current >= limit) return false;
  await env.PHOTOS_KV.put(key, String(current + 1), { expirationTtl: 3700 });
  return true;
}

function sanitizeFilename(name) {
  const cleaned = String(name || 'set').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  return cleaned || 'set';
}

// ---------------------------------------------------------------------
// admin auth — shared Supabase project with cuzbro.net
// ---------------------------------------------------------------------

async function verifyAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${match[1]}`, apikey: env.SUPABASE_ANON_KEY },
    });
    if (!res.ok) return null;
    const user = await res.json();
    const role = user.app_metadata && user.app_metadata.role;
    const email = String(user.email || '').toLowerCase();
    if (role === 'admin' || email === GUEST_ADMIN_EMAIL) return user;
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// photos
// ---------------------------------------------------------------------

async function listPhotos(slug, env, cors) {
  const raw = await env.PHOTOS_KV.get(`photos:${slug}`);
  const photos = raw ? JSON.parse(raw) : [];
  const withUrls = photos.map((p) => ({
    src: `${env.MEDIA_BASE_URL}/${p.key}`,
    caption: p.caption || '',
    uploadedAt: p.uploadedAt,
  }));
  return json({ photos: withUrls }, 200, cors);
}

async function listAllPhotos(env, cors) {
  const photos = [];
  let cursor;

  do {
    const listing = await env.PHOTOS_KV.list({ prefix: 'photos:', cursor });
    for (const key of listing.keys) {
      const slug = key.name.slice('photos:'.length);
      const raw = await env.PHOTOS_KV.get(key.name);
      const shown = raw ? JSON.parse(raw) : [];
      for (const p of shown) {
        photos.push({
          slug,
          src: `${env.MEDIA_BASE_URL}/${p.key}`,
          caption: p.caption || '',
          uploadedAt: p.uploadedAt,
        });
      }
    }
    cursor = listing.list_complete ? undefined : listing.cursor;
  } while (cursor);

  return json({ photos }, 200, cors);
}

async function uploadPhoto(slug, request, env, cors) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await rateLimitOk(env, 'upload', ip, UPLOAD_RATE_LIMIT_PER_HOUR))) {
    return json({ error: 'Too many uploads from this network in the last hour. Try again later.' }, 429, cors);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Expected multipart/form-data with a file field.' }, 400, cors);
  }

  const file = form.get('file');
  const caption = String(form.get('caption') || '').slice(0, 200);

  if (!file || typeof file === 'string') {
    return json({ error: 'No file provided.' }, 400, cors);
  }
  if (!ALLOWED_TYPES[file.type]) {
    return json({ error: 'Only JPEG, PNG, WEBP, or GIF images are allowed.' }, 415, cors);
  }
  if (file.size > MAX_FILE_BYTES) {
    return json({ error: 'Photo is too large (8MB max).' }, 413, cors);
  }

  const listKey = `photos:${slug}`;
  const raw = await env.PHOTOS_KV.get(listKey);
  const photos = raw ? JSON.parse(raw) : [];
  if (photos.length >= MAX_PHOTOS_PER_SHOW) {
    return json({ error: 'This show already has the maximum number of photos.' }, 409, cors);
  }

  const ext = ALLOWED_TYPES[file.type];
  const stamp = Date.now();
  const rand = crypto.randomUUID().slice(0, 8);
  const objectKey = `concerts/${slug}/${stamp}-${rand}.${ext}`;

  await env.PHOTOS_BUCKET.put(objectKey, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const record = { key: objectKey, caption, uploadedAt: new Date().toISOString() };
  photos.push(record);
  await env.PHOTOS_KV.put(listKey, JSON.stringify(photos));

  return json({
    photo: { src: `${env.MEDIA_BASE_URL}/${objectKey}`, caption: record.caption, uploadedAt: record.uploadedAt },
  }, 201, cors);
}

// ---------------------------------------------------------------------
// guests
// ---------------------------------------------------------------------

function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ');
}

async function getGuestTotal(env, normalized) {
  const raw = await env.PHOTOS_KV.get(`guesttotal:${normalized}`);
  return raw ? JSON.parse(raw) : null;
}

async function listGuests(slug, env, cors) {
  const raw = await env.PHOTOS_KV.get(`guests:${slug}`);
  const names = raw ? JSON.parse(raw) : [];
  const guests = await Promise.all(names.map(async (name) => {
    const total = await getGuestTotal(env, name.toLowerCase());
    return { name, total: total ? total.count : 1 };
  }));
  return json({ guests }, 200, cors);
}

async function listGuestShows(name, env, cors) {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return json({ error: 'Name is required.' }, 400, cors);

  const shows = [];
  let cursor;
  do {
    const listing = await env.PHOTOS_KV.list({ prefix: 'guests:', cursor });
    for (const key of listing.keys) {
      const slug = key.name.slice('guests:'.length);
      const raw = await env.PHOTOS_KV.get(key.name);
      const names = raw ? JSON.parse(raw) : [];
      if (names.some((n) => n.toLowerCase() === normalized)) {
        shows.push(slug);
      }
    }
    cursor = listing.list_complete ? undefined : listing.cursor;
  } while (cursor);

  return json({ shows }, 200, cors);
}

async function addGuest(slug, request, env, cors) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await rateLimitOk(env, 'guest', ip, GUEST_RATE_LIMIT_PER_HOUR))) {
    return json({ error: 'Too many additions from this network in the last hour. Try again later.' }, 429, cors);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body with a name field.' }, 400, cors);
  }

  const name = normalizeName(String(body.name || ''));
  if (!name) {
    return json({ error: 'Name is required.' }, 400, cors);
  }
  if (name.length > MAX_NAME_LENGTH) {
    return json({ error: `Name is too long (${MAX_NAME_LENGTH} characters max).` }, 400, cors);
  }

  const normalized = name.toLowerCase();
  const listKey = `guests:${slug}`;
  const raw = await env.PHOTOS_KV.get(listKey);
  const names = raw ? JSON.parse(raw) : [];

  const alreadyListed = names.some((n) => n.toLowerCase() === normalized);
  if (alreadyListed) {
    const total = await getGuestTotal(env, normalized);
    return json({ name, total: total ? total.count : 1, alreadyListed: true }, 200, cors);
  }

  if (names.length >= MAX_GUESTS_PER_SHOW) {
    return json({ error: 'This show already has the maximum number of guests.' }, 409, cors);
  }

  names.push(name);
  await env.PHOTOS_KV.put(listKey, JSON.stringify(names));

  const totalKey = `guesttotal:${normalized}`;
  const existingTotal = await getGuestTotal(env, normalized);
  const nextTotal = { name: existingTotal ? existingTotal.name : name, count: (existingTotal ? existingTotal.count : 0) + 1 };
  await env.PHOTOS_KV.put(totalKey, JSON.stringify(nextTotal));

  return json({ name, total: nextTotal.count, alreadyListed: false }, 201, cors);
}

// ---------------------------------------------------------------------
// music sets (admin upload, public download)
// ---------------------------------------------------------------------

async function listSets(slug, env, cors) {
  const raw = await env.PHOTOS_KV.get(`sets:${slug}`);
  const sets = raw ? JSON.parse(raw) : [];
  const withUrls = sets.map((s) => ({
    id: s.id,
    type: s.type || 'file',
    filename: s.filename || null,
    label: s.label || '',
    sizeBytes: s.sizeBytes || 0,
    uploadedAt: s.uploadedAt,
    url: s.type === 'link' ? s.url : `${env.MEDIA_BASE_URL}/${s.key}`,
  }));
  return json({ sets: withUrls }, 200, cors);
}

async function initSet(slug, request, env, cors) {
  const user = await verifyAdmin(request, env);
  if (!user) return json({ error: 'Unauthorized.' }, 401, cors);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400, cors);
  }

  const filename = sanitizeFilename(body.filename);
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_AUDIO_EXT.includes(ext)) {
    return json({ error: `Unsupported file type .${ext}. Allowed: ${ALLOWED_AUDIO_EXT.join(', ')}.` }, 415, cors);
  }

  const contentType = body.contentType || 'application/octet-stream';
  const stamp = Date.now();
  const rand = crypto.randomUUID().slice(0, 8);
  const key = `sets/${slug}/${stamp}-${rand}-${filename}`;

  const upload = await env.PHOTOS_BUCKET.createMultipartUpload(key, {
    httpMetadata: { contentType },
  });

  return json({ key, uploadId: upload.uploadId }, 201, cors);
}

async function uploadSetPart(slug, request, env, cors, url) {
  const user = await verifyAdmin(request, env);
  if (!user) return json({ error: 'Unauthorized.' }, 401, cors);

  const key = url.searchParams.get('key');
  const uploadId = url.searchParams.get('uploadId');
  const partNumber = parseInt(url.searchParams.get('partNumber') || '', 10);

  if (!key || !uploadId || !partNumber) {
    return json({ error: 'Missing key, uploadId, or partNumber.' }, 400, cors);
  }
  if (!key.startsWith(`sets/${slug}/`)) {
    return json({ error: 'Key does not match this show.' }, 400, cors);
  }

  const buf = await request.arrayBuffer();
  const upload = env.PHOTOS_BUCKET.resumeMultipartUpload(key, uploadId);
  const part = await upload.uploadPart(partNumber, buf);

  return json({ partNumber: part.partNumber, etag: part.etag }, 200, cors);
}

async function completeSet(slug, request, env, cors) {
  const user = await verifyAdmin(request, env);
  if (!user) return json({ error: 'Unauthorized.' }, 401, cors);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400, cors);
  }

  const { key, uploadId, parts, filename, label, sizeBytes } = body;
  if (!key || !uploadId || !Array.isArray(parts) || !parts.length) {
    return json({ error: 'Missing key, uploadId, or parts.' }, 400, cors);
  }
  if (!key.startsWith(`sets/${slug}/`)) {
    return json({ error: 'Key does not match this show.' }, 400, cors);
  }

  const upload = env.PHOTOS_BUCKET.resumeMultipartUpload(key, uploadId);
  await upload.complete(parts);

  const listKey = `sets:${slug}`;
  const raw = await env.PHOTOS_KV.get(listKey);
  const sets = raw ? JSON.parse(raw) : [];
  const record = {
    id: crypto.randomUUID(),
    type: 'file',
    key,
    filename: filename || key.split('/').pop(),
    label: String(label || '').slice(0, 120),
    sizeBytes: Number(sizeBytes) || 0,
    uploadedAt: new Date().toISOString(),
    uploadedBy: user.email || 'admin',
  };
  sets.push(record);
  await env.PHOTOS_KV.put(listKey, JSON.stringify(sets));

  return json({ set: { ...record, url: `${env.MEDIA_BASE_URL}/${key}` } }, 201, cors);
}

async function addSetLink(slug, request, env, cors) {
  const user = await verifyAdmin(request, env);
  if (!user) return json({ error: 'Unauthorized.' }, 401, cors);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400, cors);
  }

  const url = String(body.url || '').trim();
  if (!/^https?:\/\/.+/i.test(url)) {
    return json({ error: 'Enter a valid http(s) link.' }, 400, cors);
  }
  if (url.length > 2000) {
    return json({ error: 'That link is too long.' }, 400, cors);
  }

  const listKey = `sets:${slug}`;
  const raw = await env.PHOTOS_KV.get(listKey);
  const sets = raw ? JSON.parse(raw) : [];
  const record = {
    id: crypto.randomUUID(),
    type: 'link',
    url,
    label: String(body.label || '').slice(0, 120),
    uploadedAt: new Date().toISOString(),
    uploadedBy: user.email || 'admin',
  };
  sets.push(record);
  await env.PHOTOS_KV.put(listKey, JSON.stringify(sets));

  return json({ set: record }, 201, cors);
}

async function abortSet(slug, request, env, cors) {
  const user = await verifyAdmin(request, env);
  if (!user) return json({ error: 'Unauthorized.' }, 401, cors);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400, cors);
  }

  const { key, uploadId } = body;
  if (!key || !uploadId || !key.startsWith(`sets/${slug}/`)) {
    return json({ error: 'Missing or invalid key/uploadId.' }, 400, cors);
  }

  try {
    const upload = env.PHOTOS_BUCKET.resumeMultipartUpload(key, uploadId);
    await upload.abort();
  } catch {
    // Already completed or aborted — treat as success.
  }

  return json({ ok: true }, 200, cors);
}

async function deleteSet(slug, request, env, cors) {
  const user = await verifyAdmin(request, env);
  if (!user) return json({ error: 'Unauthorized.' }, 401, cors);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400, cors);
  }

  const id = body.id;
  if (!id) {
    return json({ error: 'Missing id.' }, 400, cors);
  }

  const listKey = `sets:${slug}`;
  const raw = await env.PHOTOS_KV.get(listKey);
  const sets = raw ? JSON.parse(raw) : [];
  const record = sets.find((s) => s.id === id);
  if (!record) {
    return json({ error: 'Set not found.' }, 404, cors);
  }

  if (record.type !== 'link' && record.key) {
    await env.PHOTOS_BUCKET.delete(record.key);
  }

  await env.PHOTOS_KV.put(listKey, JSON.stringify(sets.filter((s) => s.id !== id)));

  return json({ ok: true }, 200, cors);
}

// ---------------------------------------------------------------------
// storage usage (admin only)
// ---------------------------------------------------------------------

async function storageUsage(request, env, cors) {
  const user = await verifyAdmin(request, env);
  if (!user) return json({ error: 'Unauthorized.' }, 401, cors);

  let totalBytes = 0;
  let objectCount = 0;
  let photosBytes = 0;
  let setsBytes = 0;
  let cursor;

  do {
    const listing = await env.PHOTOS_BUCKET.list({ cursor, limit: 1000 });
    for (const obj of listing.objects) {
      totalBytes += obj.size;
      objectCount += 1;
      if (obj.key.startsWith('sets/')) setsBytes += obj.size;
      else photosBytes += obj.size;
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);

  return json({ totalBytes, objectCount, photosBytes, setsBytes }, 200, cors);
}

// ---------------------------------------------------------------------
// router
// ---------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/api/admin/storage-usage' && request.method === 'GET') {
      return storageUsage(request, env, cors);
    }

    if (url.pathname === '/api/all-photos' && request.method === 'GET') {
      return listAllPhotos(env, cors);
    }

    const photosMatch = url.pathname.match(/^\/api\/concerts\/([^/]+)\/photos\/?$/);
    if (photosMatch) {
      const slug = photosMatch[1];
      if (!SLUG_RE.test(slug)) return json({ error: 'Invalid show identifier.' }, 400, cors);
      if (request.method === 'GET') return listPhotos(slug, env, cors);
      if (request.method === 'POST') return uploadPhoto(slug, request, env, cors);
      return json({ error: 'Method not allowed.' }, 405, cors);
    }

    const guestShowsMatch = url.pathname.match(/^\/api\/guests\/([^/]+)\/shows\/?$/);
    if (guestShowsMatch) {
      if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, cors);
      const name = decodeURIComponent(guestShowsMatch[1]);
      return listGuestShows(name, env, cors);
    }

    const guestsMatch = url.pathname.match(/^\/api\/concerts\/([^/]+)\/guests\/?$/);
    if (guestsMatch) {
      const slug = guestsMatch[1];
      if (!SLUG_RE.test(slug)) return json({ error: 'Invalid show identifier.' }, 400, cors);
      if (request.method === 'GET') return listGuests(slug, env, cors);
      if (request.method === 'POST') return addGuest(slug, request, env, cors);
      return json({ error: 'Method not allowed.' }, 405, cors);
    }

    const setsMatch = url.pathname.match(/^\/api\/concerts\/([^/]+)\/sets\/?$/);
    if (setsMatch) {
      const slug = setsMatch[1];
      if (!SLUG_RE.test(slug)) return json({ error: 'Invalid show identifier.' }, 400, cors);
      if (request.method === 'GET') return listSets(slug, env, cors);
      return json({ error: 'Method not allowed.' }, 405, cors);
    }

    const adminSetsMatch = url.pathname.match(/^\/api\/admin\/concerts\/([^/]+)\/sets\/(init|part|complete|abort|link)\/?$/);
    if (adminSetsMatch) {
      const [, slug, action] = adminSetsMatch;
      if (!SLUG_RE.test(slug)) return json({ error: 'Invalid show identifier.' }, 400, cors);
      if (action === 'init' && request.method === 'POST') return initSet(slug, request, env, cors);
      if (action === 'part' && request.method === 'PUT') return uploadSetPart(slug, request, env, cors, url);
      if (action === 'complete' && request.method === 'POST') return completeSet(slug, request, env, cors);
      if (action === 'abort' && request.method === 'POST') return abortSet(slug, request, env, cors);
      if (action === 'link' && request.method === 'POST') return addSetLink(slug, request, env, cors);
      return json({ error: 'Method not allowed.' }, 405, cors);
    }

    const adminSetsDeleteMatch = url.pathname.match(/^\/api\/admin\/concerts\/([^/]+)\/sets\/?$/);
    if (adminSetsDeleteMatch) {
      const slug = adminSetsDeleteMatch[1];
      if (!SLUG_RE.test(slug)) return json({ error: 'Invalid show identifier.' }, 400, cors);
      if (request.method === 'DELETE') return deleteSet(slug, request, env, cors);
      return json({ error: 'Method not allowed.' }, 405, cors);
    }

    return json({ error: 'Not found.' }, 404, cors);
  },
};
