(function () {
  // DOOM cheat code: iddqd — toggles a green "hacker terminal" mode.
  var SEQUENCE = ['i', 'd', 'd', 'q', 'd'];
  var buffer = [];
  var active = false;
  var toastTimer = null;

  function showToast(text) {
    var toast = document.getElementById('godmode-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'godmode-toast';
      toast.className = 'godmode-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    void toast.offsetWidth; // restart the CSS transition
    toast.classList.add('is-visible');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 3200);
  }

  function toggleGodMode() {
    active = !active;
    document.body.classList.toggle('godmode-active', active);
    showToast(active ? 'GOD MODE ACTIVATED. WHAT HAVE YOU DONE?' : 'GOD MODE DEACTIVATED');
  }

  window.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;

    var key = e.key.toLowerCase();
    buffer.push(key);
    if (buffer.length > SEQUENCE.length) buffer.shift();

    if (buffer.length === SEQUENCE.length && buffer.every(function (k, i) { return k === SEQUENCE[i]; })) {
      buffer = [];
      toggleGodMode();
    }
  });
})();
