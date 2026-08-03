(function () {
  const section = document.getElementById('spotlight-section');
  if (!section) return;

  const manifest = window.__ASHTON_SPOTLIGHT__ || [];
  const apiBase = section.dataset.apiBase;
  if (!apiBase || !manifest.length) return;

  const byslug = new Map(manifest.map((s) => [s.slug, s]));

  const card = document.getElementById('spotlight-card');
  const img = document.getElementById('spotlight-img');
  const numEl = document.getElementById('spotlight-num');
  const bandEl = document.getElementById('spotlight-band');
  const metaEl = document.getElementById('spotlight-meta');
  const prevBtn = document.getElementById('spotlight-prev');
  const nextBtn = document.getElementById('spotlight-next');

  let photos = [];
  let order = [];
  let pos = 0;
  let timer = null;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function render() {
    const p = photos[order[pos]];
    const s = byslug.get(p.slug);
    if (!s) return;

    img.classList.remove('is-loaded');
    const pre = new Image();
    pre.onload = () => {
      img.src = p.src;
      img.classList.add('is-loaded');
    };
    pre.src = p.src;
    img.alt = p.caption || `${s.band} at ${s.venue}`;

    numEl.textContent = `#${s.number}`;
    bandEl.textContent = s.showTitle ? `${s.band} — ${s.showTitle}` : s.band;
    metaEl.textContent = p.caption
      ? `${p.caption} — ${s.venue} • ${s.city} • ${s.date}`
      : `${s.venue} • ${s.city} • ${s.date}`;
    card.dataset.href = `concerts/${s.slug}.html`;
  }

  function goToShow() {
    if (card.dataset.href) window.location.href = card.dataset.href;
  }

  function resetTimer() {
    if (timer) clearInterval(timer);
    timer = setInterval(next, 10000);
  }

  function next() {
    pos = (pos + 1) % order.length;
    render();
    resetTimer();
  }

  function prev() {
    pos = (pos - 1 + order.length) % order.length;
    render();
    resetTimer();
  }

  async function init() {
    try {
      const res = await fetch(`${apiBase}/api/all-photos`);
      if (!res.ok) throw new Error('failed to load photos');
      const data = await res.json();
      photos = (data.photos || []).filter((p) => byslug.has(p.slug));
    } catch (err) {
      photos = [];
    }

    if (!photos.length) return;

    section.style.display = '';
    order = shuffle(photos.map((_, i) => i));
    pos = 0;
    render();

    card.addEventListener('click', (e) => {
      if (e.target.closest('.spotlight-nav')) return;
      goToShow();
    });
    card.addEventListener('keydown', (e) => {
      if (e.target.closest('.spotlight-nav')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goToShow();
      }
    });

    if (photos.length > 1) {
      resetTimer();
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        prev();
      });
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        next();
      });
    } else {
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
    }
  }

  init();
})();
