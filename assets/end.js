/* End of the road: a "Do not touch" button at the foot of the page. Pressing it lets the
   visible page fall and pile up, then offers the hidden archives. Declining rebuilds the page. */
(() => {
  'use strict';
  const footer = document.querySelector('.site-footer .wrap');
  if (!footer || !('showModal' in document.createElement('dialog'))) return;

  const ARCHIVE_URL = 'archives/';
  const GRAVITY = 2600;        // px per second squared
  const BOUNCE = 0.22;         // share of speed kept after hitting the pile
  const COLUMN = 36;           // px width of one pile column
  const MAX_FALL_MS = 4200;    // the pop-up opens by then even if a piece is still rolling
  const PIECES = [
    '.site-header',
    '.hero-name', '.hero-stage', '.hero-tag', '.hero-lede', '.hero-about', '.hero-side', '.hero-under > *',
    '.section-marker', '.feature-graph', '.feature-copy > *', '.facts > div',
    '.work-heading > *', '.group-head', '.work-art', '.work-copy > *', '.spec > div', '.entry-end',
    '.research-section h2', '.research-intro > p', '.research-ledger > article',
    '.audit-section h2', '.audit-lede', '.audit-row', '.audit-section .toggle',
    '.writing-section h2', '.paper', '.about-grid > h2', '.timeline > .tl',
    '.footer-call', '.footer-grid > p', '.footer-grid li', '.fine > span', '.end-trigger'
  ].join(',');

  // These fall whole; everything else with a few words in it falls word by word.
  const WHOLE = '.site-header, .end-trigger, .feature-graph, .work-art, .hero-stage, .hero-side, .hero-name';
  const MAX_BODIES = 260;
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const zone = document.createElement('div');
  zone.className = 'end-zone';
  // The siren: a slow rotating beacon and a pulsing glow behind the button.
  // It lives in its own clipped layer so its light never stretches the page.
  const light = document.createElement('div');
  light.className = 'end-light';
  light.setAttribute('aria-hidden', 'true');
  const beacon = document.createElement('span');
  beacon.className = 'end-beacon';
  light.append(beacon);
  footer.parentElement.prepend(light);
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'end-trigger';
  trigger.textContent = 'Do not touch';
  zone.append(trigger);
  footer.append(zone);

  const dialog = document.createElement('dialog');
  dialog.className = 'end-dialog';
  dialog.setAttribute('aria-labelledby', 'end-dialog-title');
  dialog.innerHTML =
    '<p class="end-kicker">A hidden message</p>' +
    '<h2 id="end-dialog-title">You have reached the end of the road.</h2>' +
    '<p>Would you like to enter the hidden archives?</p>' +
    '<div class="end-actions"><a class="end-yes" href="' + ARCHIVE_URL + '">Yes</a>' +
    '<button type="button" class="end-no">No</button></div>';
  document.body.append(dialog);

  // The button appears once the visitor reaches the foot of the page (or tabs to it).
  const placeBeacon = () => {
    const host = footer.parentElement.getBoundingClientRect(), b = trigger.getBoundingClientRect();
    beacon.style.left = (b.left + b.width / 2 - host.left) + 'px';
    beacon.style.top = (b.top + b.height / 2 - host.top) + 'px';
  };
  const arm = () => { placeBeacon(); zone.classList.add('is-armed'); light.classList.add('is-armed'); };
  addEventListener('resize', () => { if (state === 'idle') placeBeacon(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) arm(); }, { threshold: 0.9 }).observe(zone);
  } else arm();
  trigger.addEventListener('focus', arm);

  let state = 'idle';
  let bodies = [];
  let heights = null;
  let frame = 0;
  let started = 0;
  let previous = 0;
  let words = [];

  function collect() {
    const all = Array.from(document.querySelectorAll(PIECES));
    const set = new Set(all);
    return all.filter(el => {
      for (let p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    });
  }

  // Wrap each word in its own span so text can fall apart. Links stay in one piece.
  function split(el) {
    if (el.matches(WHOLE) || el.querySelector('img, svg, picture, button')) return [el];
    if (el.textContent.trim().split(/\s+/).length < 4) return [el];
    const scope = el.querySelector(':scope > .motion-original') || el;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode: node => !node.nodeValue.trim() || node.parentElement.closest('a, .motion-fragments') && node.parentElement.closest('a, .motion-fragments') !== scope
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    const out = [];
    texts.forEach(node => {
      const piece = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(token => {
        if (!token) return;
        if (/^\s+$/.test(token)) { piece.append(token); return; }
        const word = document.createElement('span');
        word.className = 'end-word';
        word.textContent = token;
        piece.append(word);
        words.push(word);
        out.push(word);
      });
      node.replaceWith(piece);
    });
    scope.querySelectorAll('a').forEach(link => { if (!link.closest('.motion-fragments')) out.push(link); });
    return out.length ? out : [el];
  }

  function lock(on) {
    if (on) {
      const gutter = innerWidth - root.clientWidth;
      if (gutter > 0) document.body.style.paddingRight = gutter + 'px';
    } else document.body.style.paddingRight = '';
    root.classList.toggle('end-locked', on);
  }

  function pile(left, right) {
    let top = 0;
    const a = clamp(Math.floor(left / COLUMN), 0, heights.length - 1);
    const b = clamp(Math.floor(right / COLUMN), 0, heights.length - 1);
    for (let i = a; i <= b; i++) if (heights[i] > top) top = heights[i];
    return { a, b, top };
  }

  function crumble() {
    if (state !== 'idle') return;
    if (reduce.matches) { state = 'down'; dialog.showModal(); return; }
    state = 'falling';
    const elements = [];
    collect().forEach(el => { elements.push(...(elements.length < MAX_BODIES ? split(el) : [el])); });
    // Measure everything before changing any style.
    const rects = elements.map(el => el.getBoundingClientRect());
    const computed = elements.map(el => getComputedStyle(el));
    const inline = computed.map(c => c.display === 'inline');
    const fixedInPlace = computed.map(c => c.position === 'static');
    root.classList.add('end-crumbling', 'end-dark');
    lock(true);
    heights = new Float32Array(Math.ceil(innerWidth / COLUMN) + 1);
    bodies = elements.map((el, i) => {
      const r = rects[i];
      if (inline[i]) el.style.display = 'inline-block';
      if (fixedInPlace[i]) el.style.position = 'relative';
      el.style.zIndex = '70';
      el.style.transition = 'none';
      el.style.willChange = 'transform';
      el.classList.add('end-piece');
      return {
        el, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2,
        x: 0, y: 0, a: 0,
        vx: (Math.random() - 0.5) * 320, vy: -Math.random() * 160, va: (Math.random() - 0.5) * 5,
        // Lower pieces let go first, so the page gives way from the bottom up.
        delay: (1 - clamp(r.top / innerHeight, 0, 1)) * 0.55 + Math.random() * 0.25,
        asleep: false, rest: null, inline: inline[i], positioned: fixedInPlace[i], tape: []
      };
    });
    started = previous = performance.now();
    frame = requestAnimationFrame(step);
  }

  function step(now) {
    const dt = Math.min(0.032, (now - previous) / 1000);
    previous = now;
    const t = (now - started) / 1000;
    const floor = innerHeight;
    let moving = 0;
    bodies.forEach(b => {
      if (t < b.delay) { moving++; return; }
      if (b.asleep) {
        // Ease the last few degrees so the piece lies down limp instead of freezing mid-air.
        const k = Math.min(1, dt * 9);
        b.a += (b.rest.a - b.a) * k;
        b.y += (b.rest.y - b.y) * k;
        if (Math.abs(b.rest.a - b.a) > 0.002 || Math.abs(b.rest.y - b.y) > 0.3) moving++;
      } else {
        moving++;
        b.vy += GRAVITY * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt;
        const cx = b.cx + b.x;
        const half = (Math.abs(Math.sin(b.a)) * b.w + Math.abs(Math.cos(b.a)) * b.h) / 2;
        const reach = (Math.abs(Math.cos(b.a)) * b.w + Math.abs(Math.sin(b.a)) * b.h) / 2;
        // Keep most of each piece on screen.
        const edge = Math.min(reach * 0.7, innerWidth / 2);
        if (cx < edge || cx > innerWidth - edge) { b.vx = -b.vx * 0.5; b.x += cx < edge ? edge - cx : innerWidth - edge - cx; }
        const under = pile(cx - reach, cx + reach);
        const ground = floor - under.top;
        const bottom = b.cy + b.y + half;
        if (bottom > ground) {
          b.y -= bottom - ground;
          if (b.vy > 0) { b.vy = -b.vy * BOUNCE; b.vx *= 0.6; b.va *= 0.45; }
          if (Math.abs(b.vy) < 90) {
            // Come to rest lying nearly flat, with a slight slump.
            const flat = Math.round(b.a / Math.PI) * Math.PI + (Math.random() - 0.5) * 0.3;
            const flatHalf = (Math.abs(Math.sin(flat)) * b.w + Math.abs(Math.cos(flat)) * b.h) / 2;
            const flatReach = (Math.abs(Math.cos(flat)) * b.w + Math.abs(Math.sin(flat)) * b.h) / 2;
            const bed = pile(cx - flatReach, cx + flatReach);
            b.rest = { a: flat, y: floor - bed.top - flatHalf - b.cy };
            // The heap grows slowly, so pieces end up in a low drift along the bottom edge.
            const cap = floor * 0.28;
            const rise = bed.top > cap ? 1 : Math.min(flatHalf * 2 * 0.3, 12);
            for (let i = bed.a; i <= bed.b; i++) heights[i] = bed.top + rise;
            b.asleep = true;
          }
        }
      }
      b.el.style.transform = 'translate3d(' + b.x.toFixed(1) + 'px,' + b.y.toFixed(1) + 'px,0) rotate(' + b.a.toFixed(4) + 'rad)';
    });
    // Keep every frame, so declining can play the fall backwards.
    bodies.forEach(b => b.tape.push(b.x, b.y, b.a));
    if (moving && now - started < MAX_FALL_MS) frame = requestAnimationFrame(step);
    else { frame = 0; state = 'down'; dialog.showModal(); }
  }

  function clean() {
    bodies.forEach(b => {
      const s = b.el.style;
      s.transform = ''; s.transition = ''; s.willChange = '';
      if (b.inline) s.display = '';
      if (b.positioned) s.position = '';
      s.zIndex = '';
      b.el.classList.remove('end-piece');
      if (!b.el.getAttribute('style')) b.el.removeAttribute('style');
    });
    bodies = [];
    // Put the split text back exactly as it was.
    const parents = new Set();
    words.forEach(word => { if (word.parentNode) { parents.add(word.parentNode); word.replaceWith(word.textContent); } });
    parents.forEach(parent => parent.normalize());
    words = [];
    root.classList.remove('end-crumbling', 'end-dark');
    lock(false);
    state = 'idle';
    // Let the scroll motion re-measure the restored page.
    dispatchEvent(new Event('resize'));
  }

  // "No" rewinds time: the recorded fall plays backwards until the page stands as it did.
  function rebuild() {
    if (state !== 'down') return;
    if (!bodies.length) { state = 'idle'; trigger.focus(); return; }
    state = 'rising';
    root.classList.remove('end-dark');
    const frames = bodies[0].tape.length / 3;
    const duration = Math.max(700, Math.min(1900, frames * 16.7 * 0.55));
    const begun = performance.now();
    const rewind = now => {
      const t = Math.min(1, (now - begun) / duration);
      // Ease out, so the last pieces click gently back into place.
      const eased = 1 - Math.pow(1 - t, 2.2);
      const at = Math.max(0, Math.round((frames - 1) * (1 - eased)));
      bodies.forEach(b => {
        const i = Math.min(at, b.tape.length / 3 - 1) * 3;
        b.el.style.transform = 'translate3d(' + b.tape[i].toFixed(1) + 'px,' + b.tape[i + 1].toFixed(1) + 'px,0) rotate(' + b.tape[i + 2].toFixed(4) + 'rad)';
      });
      if (t < 1) frame = requestAnimationFrame(rewind);
      else { frame = 0; clean(); trigger.focus({ preventScroll: true }); }
    };
    frame = requestAnimationFrame(rewind);
  }

  trigger.addEventListener('click', crumble);
  dialog.querySelector('.end-no').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', rebuild);
  // Coming back from the archives with the browser's Back button restores a standing page.
  addEventListener('pageshow', event => {
    if (!event.persisted) return;
    cancelAnimationFrame(frame); frame = 0;
    if (dialog.open) { state = 'idle'; dialog.close(); }
    clean();
  });
})();
