(function () {
  const section = document.getElementById('music-set');
  if (!section) return;

  const slug = section.dataset.slug;
  const apiBase = section.dataset.apiBase;
  const list = document.getElementById('set-list');
  const emptyState = document.getElementById('set-empty');
  const countLabel = document.getElementById('set-count');

  function formatBytes(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i += 1;
    }
    return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function addSetCard(set) {
    const card = document.createElement('a');
    card.className = 'set-card';
    card.href = set.url;
    card.setAttribute('download', set.filename || '');

    const info = document.createElement('div');
    info.className = 'set-card-info';

    const title = document.createElement('div');
    title.className = 'set-card-title';
    title.textContent = set.label || set.filename || 'Concert recording';
    info.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'set-card-meta';
    meta.textContent = [set.filename, formatBytes(set.sizeBytes)].filter(Boolean).join(' — ');
    info.appendChild(meta);

    card.appendChild(info);

    const action = document.createElement('div');
    action.className = 'set-card-download';
    action.textContent = 'Download';
    card.appendChild(action);

    list.appendChild(card);
  }

  async function loadSets() {
    try {
      const res = await fetch(`${apiBase}/api/concerts/${slug}/sets`);
      if (!res.ok) return;
      const data = await res.json();
      data.sets.forEach(addSetCard);
      const n = data.sets.length;
      countLabel.textContent = n ? `${n} file${n === 1 ? '' : 's'}` : '';
      emptyState.style.display = n ? 'none' : '';
    } catch (err) {
      // Fail quietly — empty state stays visible.
    }
  }

  loadSets();
})();
