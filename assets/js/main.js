(function () {
  var el = document.getElementById('countdown-caption');
  if (!el) return;

  var birthday = new Date(el.getAttribute('data-birthday') + 'T00:00:00');

  function render() {
    var now = new Date();
    var diffMs = birthday - now;

    if (diffMs <= 0) {
      el.textContent = 'The big 4-0 is here.';
      return;
    }

    var days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    el.textContent = days + ' day' + (days === 1 ? '' : 's') + ' until 40.';
  }

  render();
  setInterval(render, 1000 * 60 * 60);
})();
