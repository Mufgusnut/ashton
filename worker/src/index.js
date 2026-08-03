/*
 * Photo upload API for the "40 Before 40" concert site.
 * - GET  /api/concerts/:slug/photos   -> list photos for a show
 * - POST /api/concerts/:slug/photos   -> upload a photo (multipart: file, caption?)
 *
 * Storage: R2 (binary files) + KV (per-show JSON list of {key, caption, uploadedAt}).
 * Public reads of the images themselves happen directly against the R2 custom
 * domain (MEDIA_BASE_URL), not through this Worker.
 */

const SLUG_RE = /^[a-z0-9-]{1,80}$/;
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_PHOTOS_PER_SHOW = 100;
const RATE_LIMIT_PER_HOUR = 20;

const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function corsHeaders(request, env) {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

async function listPhotos(slug, env, cors) {
  const raw = await env.PHOTOS_KV.get(`show:${slug}`);
  const photos = raw ? JSON.parse(raw) : [];
  const withUrls = photos.map((p) => ({
    src: `${env.MEDIA_BASE_URL}/${p.key}`,
    caption: p.caption || '',
    uploadedAt: p.uploadedAt,
  }));
  return json({ photos: withUrls }, 200, cors);
}

async function rateLimitOk(ip, env) {
  const hourBucket = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const key = `rl:${ip}:${hourBucket}`;
  const current = parseInt((await env.PHOTOS_KV.get(key)) || '0', 10);
  if (current >= RATE_LIMIT_PER_HOUR) return false;
  await env.PHOTOS_KV.put(key, String(current + 1), { expirationTtl: 3700 });
  return true;
}

async function uploadPhoto(slug, request, env, cors) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await rateLimitOk(ip, env))) {
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

  const listKey = `show:${slug}`;
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

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const match = url.pathname.match(/^\/api\/concerts\/([^/]+)\/photos\/?$/);
    if (!match) {
      return json({ error: 'Not found.' }, 404, cors);
    }

    const slug = match[1];
    if (!SLUG_RE.test(slug)) {
      return json({ error: 'Invalid show identifier.' }, 400, cors);
    }

    if (request.method === 'GET') {
      return listPhotos(slug, env, cors);
    }
    if (request.method === 'POST') {
      return uploadPhoto(slug, request, env, cors);
    }
    return json({ error: 'Method not allowed.' }, 405, cors);
  },
};
