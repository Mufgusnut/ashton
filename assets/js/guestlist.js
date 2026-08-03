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

  function currentNames() {
    return Array.from(list.querySelectorAll('.guest-chip')).map((chip) => chip.dataset.name || chip.textContent.trim());
  }

  function updateCount() {
    const n = list.children.length;
    countLabel.textContent = n ? `${n} on the list` : '';
    emptyState.style.display = n ? 'none' : '';
  }

  function addChip(name, total, prepend) {
    const chip = document.createElement('span');
    chip.className = 'guest-chip';
    chip.dataset.name = name.toLowerCase();

    const nameEl = document.createElement('span');
    nameEl.textContent = name;
    chip.appendChild(nameEl);

    if (total && total > 1) {
      const badge = document.createElement('span');
      badge.className = 'guest-count-badge';
      badge.textContent = `${total} shows`;
      chip.appendChild(badge);
    }

    if (prepend && list.firstChild) list.insertBefore(chip, list.firstChild);
    else list.appendChild(chip);
    updateCount();
  }

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
