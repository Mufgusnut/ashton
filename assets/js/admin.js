import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';

const SUPABASE_URL = 'https://qhvjhvxhvolywkxgdxxy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wR3TvwVqO7QV6qmMaA4NDA_3do0BpIh';
const GUEST_ADMIN_EMAIL = 'guest@cuzbro.net';
const CHUNK_SIZE = 40 * 1024 * 1024; // 40MB per part
const R2_FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024; // 10GB, just for the meter's reference line

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const appEl = document.getElementById('admin-app');
if (appEl) {
  const apiBase = appEl.dataset.apiBase;
  const concerts = window.__ASHTON_CONCERTS__ || [];

  const loginSection = document.getElementById('admin-login');
  const loginForm = document.getElementById('admin-login-form');
  const emailInput = document.getElementById('admin-email');
  const passwordInput = document.getElementById('admin-password');
  const loginStatus = document.getElementById('admin-login-status');
  const panel = document.getElementById('admin-panel');
  const whoami = document.getElementById('admin-whoami');
  const logoutBtn = document.getElementById('admin-logout');
  const storageFill = document.getElementById('admin-storage-fill');
  const storageLabel = document.getElementById('admin-storage-label');
  const showSelect = document.getElementById('admin-show-select');
  const setsList = document.getElementById('admin-sets-list');
  const uploadForm = document.getElementById('admin-upload-form');
  const labelInput = document.getElementById('admin-set-label');
  const fileInput = document.getElementById('admin-set-file');
  const progressWrap = document.getElementById('admin-upload-progress');
  const progressFill = document.getElementById('admin-upload-progress-fill');
  const uploadStatus = document.getElementById('admin-upload-status');
  const addTabs = document.querySelectorAll('.admin-add-tab');
  const linkForm = document.getElementById('admin-link-form');
  const linkLabelInput = document.getElementById('admin-link-label');
  const linkUrlInput = document.getElementById('admin-link-url');
  const linkStatus = document.getElementById('admin-link-status');

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i += 1;
    }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function isAuthorized(user) {
    const role = user.app_metadata && user.app_metadata.role;
    const email = String(user.email || '').toLowerCase();
    return role === 'admin' || email === GUEST_ADMIN_EMAIL;
  }

  async function authedFetch(url, options) {
    const { data } = await supabase.auth.getSession();
    const token = data.session ? data.session.access_token : null;
    const headers = Object.assign({}, (options && options.headers) || {}, token ? { Authorization: `Bearer ${token}` } : {});
    return fetch(url, Object.assign({}, options, { headers }));
  }

  function populateShowSelect() {
    showSelect.innerHTML = concerts
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((c) => {
        const label = `#${c.number} — ${c.band}${c.showTitle ? ` (${c.showTitle})` : ''} — ${c.date}`;
        return `<option value="${c.slug}">${escapeHtml(label)}</option>`;
      })
      .join('');
  }

  async function refreshStorage() {
    storageLabel.textContent = 'Loading storage usage...';
    try {
      const res = await authedFetch(`${apiBase}/api/admin/storage-usage`);
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      const pct = Math.min(100, (data.totalBytes / R2_FREE_TIER_BYTES) * 100);
      storageFill.style.width = `${pct}%`;
      storageLabel.textContent = `${formatBytes(data.totalBytes)} used across ${data.objectCount} file${data.objectCount === 1 ? '' : 's'} (${formatBytes(data.photosBytes)} photos, ${formatBytes(data.setsBytes)} sets) — free R2 tier is 10GB`;
    } catch (err) {
      storageLabel.textContent = 'Could not load storage usage.';
    }
  }

  async function deleteSet(slug, id) {
    if (!window.confirm('Delete this set? This cannot be undone.')) return;
    try {
      const res = await authedFetch(`${apiBase}/api/admin/concerts/${slug}/sets`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('delete failed');
      refreshSets();
      refreshStorage();
    } catch (err) {
      window.alert('Could not delete that set.');
    }
  }

  async function refreshSets() {
    const slug = showSelect.value;
    if (!slug) return;
    setsList.innerHTML = '<p class="admin-status">Loading...</p>';
    try {
      const res = await fetch(`${apiBase}/api/concerts/${slug}/sets`);
      const data = await res.json();
      if (!data.sets.length) {
        setsList.innerHTML = '<p class="admin-status">No sets uploaded for this show yet.</p>';
        return;
      }
      setsList.innerHTML = '';
      data.sets.forEach((set) => {
        const row = document.createElement('div');
        row.className = 'admin-set-row';
        const isLink = set.type === 'link';
        const meta = isLink ? set.url : `${set.filename} — ${formatBytes(set.sizeBytes)}`;
        row.innerHTML = `
          <div>
            <div class="admin-set-row-title"><span class="admin-set-row-type">${isLink ? 'Link' : 'File'}</span>${escapeHtml(set.label || set.filename || set.url)}</div>
            <div class="admin-set-row-meta">${escapeHtml(meta)}</div>
          </div>
          <button type="button" class="admin-set-delete">Delete</button>
        `;
        row.querySelector('.admin-set-delete').addEventListener('click', () => deleteSet(slug, set.id));
        setsList.appendChild(row);
      });
    } catch (err) {
      setsList.innerHTML = '<p class="admin-status is-error">Failed to load sets.</p>';
    }
  }

  async function uploadPart(slug, key, uploadId, partNumber, chunk) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const res = await authedFetch(
          `${apiBase}/api/admin/concerts/${slug}/sets/part?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
          { method: 'PUT', body: chunk },
        );
        if (!res.ok) throw new Error(`Part ${partNumber} failed.`);
        return res.json();
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  async function uploadFile(file, label) {
    const slug = showSelect.value;
    progressWrap.style.display = '';
    progressFill.style.width = '0%';
    uploadStatus.textContent = 'Starting upload...';
    uploadStatus.classList.remove('is-error');

    let key;
    let uploadId;

    try {
      const initRes = await authedFetch(`${apiBase}/api/admin/concerts/${slug}/sets/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream' }),
      });
      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({}));
        throw new Error(err.error || 'Could not start upload.');
      }
      ({ key, uploadId } = await initRes.json());

      const totalParts = Math.ceil(file.size / CHUNK_SIZE);
      const parts = [];

      for (let i = 0; i < totalParts; i += 1) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunk = file.slice(start, end);
        const partNumber = i + 1;

        const partData = await uploadPart(slug, key, uploadId, partNumber, chunk);
        parts.push({ partNumber: partData.partNumber, etag: partData.etag });

        const pct = Math.round(((i + 1) / totalParts) * 100);
        progressFill.style.width = `${pct}%`;
        uploadStatus.textContent = `Uploading... ${pct}% (${i + 1}/${totalParts} parts)`;
      }

      uploadStatus.textContent = 'Finalizing...';
      const completeRes = await authedFetch(`${apiBase}/api/admin/concerts/${slug}/sets/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, uploadId, parts, filename: file.name, label, sizeBytes: file.size }),
      });
      if (!completeRes.ok) throw new Error('Could not finalize upload.');

      uploadStatus.textContent = `Uploaded ${file.name}.`;
      progressFill.style.width = '100%';
      labelInput.value = '';
      fileInput.value = '';
      refreshSets();
      refreshStorage();
    } catch (err) {
      uploadStatus.textContent = err.message || 'Upload failed.';
      uploadStatus.classList.add('is-error');

      if (key && uploadId) {
        authedFetch(`${apiBase}/api/admin/concerts/${slug}/sets/abort`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, uploadId }),
        }).catch(() => {});
      }
    }
  }

  uploadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const file = fileInput.files[0];
    if (!file) return;
    uploadFile(file, labelInput.value.trim());
  });

  addTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      addTabs.forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      const mode = tab.dataset.mode;
      uploadForm.style.display = mode === 'file' ? '' : 'none';
      progressWrap.style.display = 'none';
      linkForm.style.display = mode === 'link' ? '' : 'none';
      linkStatus.style.display = 'none';
    });
  });

  linkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const slug = showSelect.value;
    const url = linkUrlInput.value.trim();
    if (!url) return;

    linkStatus.style.display = '';
    linkStatus.textContent = 'Adding link...';
    linkStatus.classList.remove('is-error');

    try {
      const res = await authedFetch(`${apiBase}/api/admin/concerts/${slug}/sets/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, label: linkLabelInput.value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add that link.');

      linkStatus.textContent = 'Link added.';
      linkUrlInput.value = '';
      linkLabelInput.value = '';
      refreshSets();
    } catch (err) {
      linkStatus.textContent = err.message || 'Could not add that link.';
      linkStatus.classList.add('is-error');
    }
  });

  showSelect.addEventListener('change', refreshSets);

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginStatus.textContent = 'Signing in...';
    loginStatus.classList.remove('is-error');
    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput.value,
      password: passwordInput.value,
    });
    if (error) {
      loginStatus.textContent = error.message;
      loginStatus.classList.add('is-error');
    }
  });

  logoutBtn.addEventListener('click', () => supabase.auth.signOut());

  function showLoggedOut() {
    loginSection.style.display = '';
    panel.style.display = 'none';
  }

  function showLoggedIn(session) {
    loginSection.style.display = 'none';
    panel.style.display = '';
    whoami.textContent = `Signed in as ${session.user.email}`;
    populateShowSelect();
    refreshSets();
    refreshStorage();
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (session && isAuthorized(session.user)) {
      showLoggedIn(session);
    } else if (session) {
      showLoggedOut();
      loginStatus.textContent = 'This account does not have admin access.';
      loginStatus.classList.add('is-error');
      supabase.auth.signOut();
    } else if (event === 'SIGNED_OUT') {
      showLoggedOut();
    }
  });

  supabase.auth.getSession().then(({ data }) => {
    if (data.session && isAuthorized(data.session.user)) {
      showLoggedIn(data.session);
    } else {
      showLoggedOut();
    }
  });
}
