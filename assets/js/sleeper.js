(function () {
  var WORD = 'sleeper';
  var FRAME_COUNT = 20;
  var FRAME_MS = 130;
  var HOLD_MS = 260;
  var POP_MS = 750;

  var buffer = '';
  var active = false;

  var scriptEl = document.currentScript;
  var framesBase = scriptEl
    ? scriptEl.src.replace(/js\/sleeper\.js.*$/, 'img/sleeper/')
    : 'assets/img/sleeper/';

  var framePaths = [];
  for (var i = 1; i <= FRAME_COUNT; i += 1) {
    var n = i < 10 ? '0' + i : String(i);
    framePaths.push(framesBase + 'frame-' + n + '.png');
  }

  function preload(paths) {
    return Promise.all(paths.map(function (src) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = resolve;
        img.onerror = resolve;
        img.src = src;
      });
    }));
  }

  function buildOverlay() {
    var overlay = document.createElement('div');
    overlay.className = 'sleeper-overlay';

    var img = document.createElement('img');
    img.className = 'sleeper-img';
    img.src = framePaths[0];
    img.alt = 'a man blowing up a balloon';
    overlay.appendChild(img);

    var burst = document.createElement('div');
    burst.className = 'sleeper-burst';
    overlay.appendChild(burst);

    var popText = document.createElement('div');
    popText.className = 'sleeper-pop-text';
    popText.textContent = 'POP!';
    overlay.appendChild(popText);

    document.body.appendChild(overlay);
    return { overlay: overlay, img: img, burst: burst, popText: popText };
  }

  function runSleeper() {
    if (active) return;
    active = true;

    preload(framePaths).then(function () {
      var refs = buildOverlay();
      var frame = 0;

      var interval = setInterval(function () {
        frame += 1;
        if (frame >= FRAME_COUNT) {
          clearInterval(interval);
          refs.img.src = framePaths[FRAME_COUNT - 1];
          setTimeout(pop, HOLD_MS);
          return;
        }
        refs.img.src = framePaths[frame];
      }, FRAME_MS);

      function pop() {
        refs.img.classList.add('is-popping');
        refs.burst.classList.add('is-active');
        refs.popText.classList.add('is-active');

        setTimeout(function () {
          refs.overlay.remove();
          active = false;
        }, POP_MS);
      }
    });
  }

  window.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    if (e.key.length !== 1) return;

    buffer += e.key.toLowerCase();
    if (buffer.length > WORD.length) buffer = buffer.slice(-WORD.length);

    if (buffer === WORD) {
      buffer = '';
      runSleeper();
    }
  });
})();
