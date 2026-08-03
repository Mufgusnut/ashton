(function () {
  // Konami-code-ish easter egg: up up down down left right left right b a
  var SEQUENCE = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  var COLORS = ['#ff2e9e', '#05dfd7', '#9d4edd', '#ffe53b', '#ff8906', '#ff2e63'];
  var buffer = [];
  var active = false;

  function buildOverlay() {
    var overlay = document.createElement('div');
    overlay.className = 'disco-overlay';

    var beamCount = 6;
    for (var i = 0; i < beamCount; i += 1) {
      var beam = document.createElement('div');
      beam.className = 'disco-beam';
      beam.style.color = COLORS[i % COLORS.length];
      beam.style.animationDuration = (4 + Math.random() * 3) + 's';
      beam.style.animationDirection = i % 2 === 0 ? 'normal' : 'reverse';
      beam.style.transform = 'translateX(-50%) rotate(' + ((360 / beamCount) * i) + 'deg)';
      overlay.appendChild(beam);
    }

    var swing = document.createElement('div');
    swing.className = 'disco-ball-swing';
    swing.innerHTML = '<div class="disco-string"></div><div class="disco-ball"></div>';
    overlay.appendChild(swing);

    var sparkleCount = 26;
    for (var j = 0; j < sparkleCount; j += 1) {
      var sparkle = document.createElement('span');
      sparkle.className = 'disco-sparkle';
      sparkle.style.left = (Math.random() * 100) + '%';
      sparkle.style.top = (Math.random() * 100) + '%';
      sparkle.style.animationDuration = (0.6 + Math.random()) + 's';
      sparkle.style.animationDelay = (Math.random() * 1.5) + 's';
      overlay.appendChild(sparkle);
    }

    var caption = document.createElement('div');
    caption.className = 'disco-caption';
    caption.textContent = 'DISCO MODE ACTIVATED';
    overlay.appendChild(caption);

    return overlay;
  }

  function runDisco() {
    if (active) return;
    active = true;

    document.body.classList.add('disco-active');
    var overlay = buildOverlay();
    document.body.appendChild(overlay);

    setTimeout(function () {
      overlay.remove();
      document.body.classList.remove('disco-active');
      active = false;
    }, 10000);
  }

  window.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;

    var key = e.key.toLowerCase();
    buffer.push(key);
    if (buffer.length > SEQUENCE.length) buffer.shift();

    if (buffer.length === SEQUENCE.length && buffer.every(function (k, i) { return k === SEQUENCE[i]; })) {
      buffer = [];
      runDisco();
    }
  });
})();
