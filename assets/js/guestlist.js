(function () {
  const form = document.getElementById('guest-form');
  if (!form) return;

  const slug = form.dataset.slug;
  const apiBase = form.dataset.apiBase;
  const list = document.getElementById('guest-list');
  const emptyState = document.getElementById('guest-list-empty');
  const countLabel = document.getElementById('guest-count');
  const statusEl = document.getElementById('guest-form-status');
  const input = document.getElementById('guest-name-input');
  const submitBtn = form.querySelector('.guest-submit');

  const MAX_NAME_LENGTH = 60;

  const manifest = window.__ASHTON_CONCERTS_MANIFEST__ || [];
  const showsBySlug = new Map(manifest.map((s) => [s.slug, s]));
  const showsCache = new Map(); // lowercased name -> array of slugs

  function currentNames() {
    return Array.from(list.querySelectorAll('.guest-chip')).map((chip) => chip.dataset.name || chip.textContent.trim());
  }

  function updateCount() {
    const n = list.children.length;
    countLabel.textContent = n ? `${n} on the list` : '';
    emptyState.style.display = n ? 'none' : '';
  }

  function closeAllDropdowns(except) {
    list.querySelectorAll('.guest-chip.is-open').forEach((chip) => {
      if (chip !== except) {
        chip.classList.remove('is-open');
        chip.setAttribute('aria-expanded', 'false');
      }
    });
  }

  async function toggleDropdown(chip, name) {
    const isOpen = chip.classList.contains('is-open');
    closeAllDropdowns(chip);
    if (isOpen) {
      chip.classList.remove('is-open');
      chip.setAttribute('aria-expanded', 'false');
      return;
    }
    chip.classList.add('is-open');
    chip.setAttribute('aria-expanded', 'true');

    let dropdown = chip.querySelector('.guest-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'guest-dropdown';
      chip.appendChild(dropdown);
    }

    const key = name.toLowerCase();
    if (showsCache.has(key)) {
      renderDropdown(dropdown, showsCache.get(key));
      return;
    }

    dropdown.innerHTML = '<div class="guest-dropdown-loading">Loading...</div>';
    try {
      const res = await fetch(`${apiBase}/api/guests/${encodeURIComponent(name)}/shows`);
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      showsCache.set(key, data.shows || []);
      renderDropdown(dropdown, data.shows || []);
    } catch (err) {
      dropdown.innerHTML = '<div class="guest-dropdown-loading">Could not load shows.</div>';
    }
  }

  function renderDropdown(dropdown, slugs) {
    const known = slugs
      .map((slug) => showsBySlug.get(slug))
      .filter(Boolean)
      .sort((a, b) => a.number - b.number);

    if (!known.length) {
      dropdown.innerHTML = '<div class="guest-dropdown-loading">No shows found.</div>';
      return;
    }

    dropdown.innerHTML = '';
    known.forEach((s) => {
      const item = document.createElement('a');
      item.className = 'guest-dropdown-item';
      item.href = `${s.slug}.html`;

      const bandEl = document.createElement('span');
      bandEl.className = 'guest-dropdown-band';
      bandEl.textContent = s.showTitle ? `${s.band} — ${s.showTitle}` : s.band;

      const dateEl = document.createElement('span');
      dateEl.className = 'guest-dropdown-date';
      dateEl.textContent = `${s.venue} • ${s.city} • ${s.date}`;

      item.appendChild(bandEl);
      item.appendChild(dateEl);
      dropdown.appendChild(item);
    });
  }

  function addChip(name, total, prepend) {
    const chip = document.createElement('span');
    chip.className = 'guest-chip';
    chip.dataset.name = name.toLowerCase();

    const nameEl = document.createElement('span');
    nameEl.textContent = name;
    chip.appendChild(nameEl);

    if (total && total > 1) {
      chip.classList.add('is-clickable');
      chip.tabIndex = 0;
      chip.setAttribute('role', 'button');
      chip.setAttribute('aria-expanded', 'false');

      const badge = document.createElement('span');
      badge.className = 'guest-count-badge';
      badge.textContent = `${total} shows`;
      chip.appendChild(badge);

      chip.addEventListener('click', (e) => {
        e.preventDefault();
        toggleDropdown(chip, name);
      });
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleDropdown(chip, name);
        }
      });
    }

    if (prepend && list.firstChild) list.insertBefore(chip, list.firstChild);
    else list.appendChild(chip);
    updateCount();
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.guest-chip')) closeAllDropdowns();
  });

  function setStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', Boolean(isError));
  }

  async function loadGuests() {
    try {
      const res = await fetch(`${apiBase}/api/concerts/${slug}/guests`);
      if (!res.ok) return;
      const data = await res.json();
      const existing = currentNames();
      data.guests.forEach((g) => {
        if (!existing.includes(g.name.toLowerCase())) addChip(g.name, g.total, false);
      });
    } catch (err) {
      // Static/curated names (if any) still render; fail quietly.
    } finally {
      updateCount();
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim().replace(/\s+/g, ' ');

    if (!name) {
      setStatus('Enter your name first.', true);
      return;
    }
    if (name.length > MAX_NAME_LENGTH) {
      setStatus(`Name is too long (${MAX_NAME_LENGTH} characters max).`, true);
      return;
    }
    if (currentNames().includes(name.toLowerCase())) {
      setStatus(`${name} is already on the list.`, true);
      input.value = '';
      return;
    }

    submitBtn.disabled = true;
    setStatus('Adding you to the list...');
    try {
      const res = await fetch(`${apiBase}/api/concerts/${slug}/guests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Could not add you to the list.', true);
        return;
      }
      addChip(data.name, data.total, true);
      input.value = '';
      setStatus(data.alreadyListed ? `${data.name} was already on the list.` : `Added ${data.name} — ${data.total} show${data.total === 1 ? '' : 's'} with Ashton.`);
    } catch (err) {
      setStatus('Could not reach the server — check your connection.', true);
    } finally {
      submitBtn.disabled = false;
    }
  });

  updateCount();
  loadGuests();
})();
