(function () {
  const card = document.getElementById('spotlight-card');
  if (!card) return;

  const shows = window.__ASHTON_SPOTLIGHT__ || [];
  if (!shows.length) return;

  const img = document.getElementById('spotlight-img');
  const numEl = document.getElementById('spotlight-num');
  const bandEl = document.getElementById('spotlight-band');
  const metaEl = document.getElementById('spotlight-meta');

  let lastIndex = -1;

  function pickIndex() {
    if (shows.length === 1) return 0;
    let i = Math.floor(Math.random() * shows.length);
    while (i === lastIndex) i = Math.floor(Math.random() * shows.length);
    return i;
  }

  function show(index) {
    lastIndex = index;
    const s = shows[index];

    img.classList.remove('is-loaded');
    const nextImg = new Image();
    nextImg.onload = () => {
      img.src = s.photo;
      img.alt = `${s.band} at ${s.venue}`;
      img.classList.add('is-loaded');
    };
    nextImg.src = s.photo;

    numEl.textContent = `#${s.number}`;
    bandEl.textContent = s.showTitle ? `${s.band} — ${s.showTitle}` : s.band;
    metaEl.textContent = `${s.venue} • ${s.city} • ${s.date}`;
    card.href = `concerts/${s.slug}.html`;
  }

  show(pickIndex());
  setInterval(() => show(pickIndex()), 10000);
})();
