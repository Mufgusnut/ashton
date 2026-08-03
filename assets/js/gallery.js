(function () {
  const dropzone = document.getElementById('dropzone');
  if (!dropzone) return;

  const slug = dropzone.dataset.slug;
  const apiBase = dropzone.dataset.apiBase;
  const grid = document.getElementById('gallery-grid');
  const emptyState = document.getElementById('gallery-empty');
  const countLabel = document.getElementById('gallery-count');
  const statusEl = document.getElementById('dropzone-status');
  const fileInput = document.getElementById('file-input');
  const browseBtn = dropzone.querySelector('.dropzone-browse');

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const MAX_BYTES = 8 * 1024 * 1024;

  function updateCount() {
    const n = grid.children.length;
    countLabel.textContent = n ? `${n} photo${n === 1 ? '' : 's'}` : '';
    emptyState.style.display = n ? 'none' : '';
  }

  function addPhotoCard(photo, prepend) {
    const fig = document.createElement('figure');
    fig.className = 'gallery-item';

    const img = document.createElement('img');
    img.src = photo.src;
    img.loading = 'lazy';
    img.alt = photo.caption || 'Concert photo';
    fig.appendChild(img);

    if (photo.caption) {
      const caption = document.createElement('figcaption');
      caption.textContent = photo.caption;
      fig.appendChild(caption);
    }

    if (prepend && grid.firstChild) grid.insertBefore(fig, grid.firstChild);
    else grid.appendChild(fig);
    updateCount();
  }

  function setStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', Boolean(isError));
  }

  function setupLightbox() {
    const overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.innerHTML = `
      <button type="button" class="lightbox-close" aria-label="Close">&times;</button>
      <img class="lightbox-img" alt="">
      <div class="lightbox-caption"></div>
    `;
    document.body.appendChild(overlay);

    const imgEl = overlay.querySelector('.lightbox-img');
    const captionEl = overlay.querySelector('.lightbox-caption');
    const closeBtn = overlay.querySelector('.lightbox-close');

    function openLightbox(src, caption) {
      imgEl.src = src;
      imgEl.alt = caption || 'Concert photo';
      captionEl.textContent = caption || '';
      captionEl.style.display = caption ? '' : 'none';
      overlay.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
      overlay.classList.remove('is-open');
      document.body.style.overflow = '';
      imgEl.src = '';
    }

    closeBtn.addEventListener('click', closeLightbox);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeLightbox();
    });

    grid.addEventListener('click', (e) => {
      const img = e.target.closest('.gallery-item img');
      if (!img) return;
      const caption = img.closest('.gallery-item').querySelector('figcaption');
      openLightbox(img.src, caption ? caption.textContent : '');
    });
  }

  async function loadExistingPhotos() {
    try {
      const res = await fetch(`${apiBase}/api/concerts/${slug}/photos`);
      if (!res.ok) return;
      const data = await res.json();
      data.photos.forEach((photo) => addPhotoCard(photo, false));
    } catch (err) {
      // Static/curated photos (if any) still render; fail quietly.
    } finally {
      updateCount();
    }
  }

  async function uploadFile(file) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus(`Skipped "${file.name}" — only JPEG, PNG, WEBP, or GIF images are allowed.`, true);
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus(`Skipped "${file.name}" — 8MB max.`, true);
      return;
    }

    const form = new FormData();
    form.append('file', file);

    setStatus(`Uploading ${file.name}...`);
    try {
      const res = await fetch(`${apiBase}/api/concerts/${slug}/photos`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Upload failed.', true);
        return;
      }
      addPhotoCard(data.photo, true);
      setStatus(`Added ${file.name}.`);
    } catch (err) {
      setStatus('Upload failed — check your connection.', true);
    }
  }

  function handleFiles(fileList) {
    Array.from(fileList).forEach(uploadFile);
  }

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });

  browseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFiles(fileInput.files);
    fileInput.value = '';
  });

  setupLightbox();
  updateCount();
  loadExistingPhotos();
})();
