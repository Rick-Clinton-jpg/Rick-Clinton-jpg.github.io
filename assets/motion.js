/* Editorial assembly: the real content stays in place; only its presentation moves. */
(() => {
  'use strict';
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  if (!('IntersectionObserver' in window)) return;

  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  // Tuning: where on the screen pieces assemble and break up, and how far they travel.
  const FRAGMENT_KINDS = ['type', 'image', 'diagram'];
  const BLOCK_TRAVEL = 28;            // px a text block slides; keep in step with motion.css
  const ENTER = { fragment: { end: 0.58, span: 0.38 }, block: { end: 0.72, span: 0.26 } };
  const EXIT_START = 0.26;            // break-up starts when the bottom edge is this far below the header (share of screen height)
  const EXIT_SPAN = 0.24;             // and completes over this much further scroll
  const records = [];
  const visible = new Set();
  let frame = 0;
  let opening = 0;
  let initialized = false;
  let enabled = false;
  let observer;
  let resizeObserver;

  function register(selector, kind) {
    document.querySelectorAll(selector).forEach(element => {
      // Keep nested motion independent and avoid animating a parent twice.
      if (element.closest('.motion-host')) return;
      element.classList.add('motion-host', `motion-${kind}`);
      const record = { element, kind, parts: null, last: null, intro: false };
      records.push(record);
    });
  }

  function fragments(record) {
    const { element, kind } = record;
    if (kind === 'diagram') {
      record.parts = Array.from(element.children).filter(child =>
        !['defs', 'title', 'desc'].includes(child.tagName.toLowerCase()));
    } else {
      const layer = document.createElement('span');
      layer.className = 'motion-fragments';
      layer.setAttribute('aria-hidden', 'true');
      layer.setAttribute('inert', '');
      let source;
      if (kind === 'type') {
        source = element.querySelector(':scope > .motion-original');
        if (!source) {
          source = document.createElement('span');
          source.className = 'motion-original';
          source.append(...element.childNodes);
          element.append(source);
        }
      } else {
        source = element.querySelector('img');
        if (!source) return;
        source.classList.add('motion-original');
      }
      // Small tiles, so the element reads as dust rather than as sliced strips.
      const columns = kind === 'image' ? 10 : 12;
      const rows = kind === 'image' ? 6 : 4;
      record.columns = columns;
      record.layer = layer;
      layer.style.setProperty('--cols', columns);
      layer.style.setProperty('--rows', rows);
      record.parts = [];
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          // Each piece is a small window onto one slice, so it costs only its own area.
          // (A full-size copy per piece multiplied graphics memory and crashed fast scrolls.)
          const part = document.createElement('span');
          part.className = 'motion-piece';
          part.style.setProperty('--c', column);
          part.style.setProperty('--r', row);
          const frame = document.createElement('span');
          frame.className = 'motion-frame';
          const copy = source.cloneNode(true);
          copy.classList.remove('motion-original');
          copy.classList.add('motion-copy');
          copy.removeAttribute('id');
          copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
          if (kind === 'image') {
            copy.alt = '';
            copy.removeAttribute('loading');
            copy.removeAttribute('fetchpriority');
          }
          frame.append(copy);
          part.append(frame);
          layer.append(part);
          record.parts.push(part);
        }
      }
      element.append(layer);
    }
    // Deterministic scatter: the same tile always takes the same path, so reversing the scroll never flickers.
    const noise = (i, salt) => { const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); };
    const columns = record.columns || 0;
    const reach = kind === 'type' ? 70 : kind === 'image' ? 60 : 46;
    const spin = kind === 'type' ? 26 : kind === 'image' ? 40 : 18;
    record.parts.forEach((part, i) => {
      // The dissolve sweeps across the element: tiles on one side go first.
      const sweep = columns ? (i % columns) / (columns - 1) : noise(i, 5);
      part.style.setProperty('--piece-x', `${((noise(i, 1) - 0.35) * 2 * reach).toFixed(1)}px`);
      part.style.setProperty('--piece-y', `${(40 + noise(i, 2) * 120).toFixed(1)}px`);
      part.style.setProperty('--piece-turn', `${((noise(i, 3) - 0.5) * 2 * spin).toFixed(1)}deg`);
      part.style.setProperty('--piece-shrink', (0.45 + noise(i, 4) * 0.4).toFixed(2));
      part.style.setProperty('--piece-delay', (sweep * 0.55 + noise(i, 6) * 0.25).toFixed(2));
      part.classList.add('motion-atom');
    });
  }

  function teardown(record) {
    if (!record.layer) return;
    record.layer.remove();
    record.layer = null;
    record.parts = null;
    record.last = null;
    record.element.classList.remove('motion-fragmenting', 'motion-gone');
  }

  function render(record, amount) {
    if (record.last !== null && Math.abs(record.last - amount) < 0.001) return;
    record.last = amount;
    const { element, kind } = record;
    const distance = Math.abs(amount);
    if (FRAGMENT_KINDS.includes(kind)) {
      if (!record.parts && distance > 0) fragments(record);
      // Fully dissolved: nothing is drawn, so the pieces need no graphics memory at all.
      const gone = distance > 0.995;
      element.classList.toggle('motion-fragmenting', distance > 0.001 && !gone);
      element.classList.toggle('motion-gone', gone);
    }
    element.style.setProperty('--unbuilt', distance.toFixed(4));
    element.style.setProperty('--direction', amount < 0 ? '-1' : '1');
    element.style.setProperty('--travel', (amount < 0 ? -distance : distance).toFixed(4));
    element.style.setProperty('--presence', (1 - smooth(distance)).toFixed(4));
  }

  function schedule() {
    if (enabled && !frame) frame = requestAnimationFrame(update);
  }

  function update(now) {
    frame = 0;
    if (!enabled) return;
    // The end-of-page fall moves elements itself; scroll motion waits until it has finished.
    if (document.documentElement.classList.contains('end-crumbling')) return;
    const height = window.innerHeight;
    const header = document.querySelector('.site-header').getBoundingClientRect().bottom;
    // At the document end, the final lines must be able to finish assembling.
    const remainingScroll = Math.max(0, document.body.offsetHeight - height - scrollY);
    const endReveal = smooth(remainingScroll / (height * 0.28));
    const intro = opening ? 1 - smooth((now - opening) / 1050) : 0;
    // Read every rectangle before writing styles, to avoid layout thrashing.
    const measurements = Array.from(visible, record => {
      const rect = record.element.getBoundingClientRect();
      // Block transforms must not feed back into their own scroll position.
      const shift = record.kind === 'block' ? BLOCK_TRAVEL * (record.last || 0) : 0;
      return [record, { top: rect.top - shift, bottom: rect.bottom - shift, height: rect.height, width: rect.width }];
    });
    measurements.forEach(([record, rect]) => {
      if (!rect.height || !rect.width) return;
      let amount = 0;
      if (!record.element.matches(':focus-within')) {
        const zone = FRAGMENT_KINDS.includes(record.kind) ? ENTER.fragment : ENTER.block;
        // Content on the first screen is already in view at rest, so it never assembles on scroll.
        const firstScreen = rect.top + scrollY < height * 0.9;
        const entering = firstScreen ? 0 : smooth((rect.top - height * zone.end) / (height * zone.span)) * endReveal;
        // Nothing breaks up while the page rests at the top.
        const startHold = smooth(scrollY / (height * 0.18));
        const leaving = smooth((header + height * EXIT_START - rect.bottom) / (height * EXIT_SPAN)) * startHold;
        amount = leaving > 0 ? -leaving : entering;
        if (record.intro && intro > Math.abs(amount)) amount = intro;
      }
      render(record, amount);
    });
    if (intro > 0) schedule();
    else opening = 0;
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    register('.hero-name, .hero-tag, .feature-title, .work-heading h2, .work-copy h3, .research-section h2, .audit-section h2, .writing-section h2, .about-section h2', 'type');
    register('.hero-stage, .work-art, .feature-visual', 'image');
    register('.layout-graph', 'diagram');
    register('.section-marker, .group-head', 'rule');
    register('.hero-lede, .hero-about, .hero-side, .hero-under, .feature-copy > p, .feature-copy > h3, .feature-links, .feature-graph figcaption, .facts > div, .work-heading > p, .work-copy > .index, .work-copy > .purpose, .spec > div, .entry-end, .research-intro > p, .research-ledger > article, .audit-lede, .audit-row, .audit-section .toggle, .paper, .about-grid > p, .timeline > .tl, .footer-call, .footer-grid, .fine', 'block');
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const record = records.find(item => item.element === entry.target);
        if (entry.isIntersecting) visible.add(record);
        else {
          visible.delete(record);
          // A focused control must never disappear when a layout change moves it.
          if (record.element.matches(':focus-within')) render(record, 0);
          teardown(record);
        }
      });
      schedule();
    }, { rootMargin: '100px 0px' });
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(document.querySelector('main'));
    }
    addEventListener('scroll', () => { opening = 0; schedule(); }, { passive: true });
    addEventListener('resize', schedule, { passive: true });
    addEventListener('pageshow', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    document.addEventListener('click', schedule);
    document.addEventListener('load', schedule, true);
    if (document.fonts) document.fonts.ready.then(schedule);
  }

  function setMotion() {
    enabled = !preference.matches;
    if (enabled) {
      initialize();
      opening = window.scrollY < 10 && !location.hash ? performance.now() : 0;
      document.documentElement.classList.add('editorial-motion');
      records.forEach(record => {
        const rect = record.element.getBoundingClientRect();
        record.intro = Boolean(opening && rect.top < innerHeight && rect.bottom > 0);
        if (rect.top < innerHeight + 100 && rect.bottom > -100) visible.add(record);
        observer.observe(record.element);
      });
      schedule();
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      opening = 0;
      document.documentElement.classList.remove('editorial-motion');
      if (observer) observer.disconnect();
      records.forEach(record => render(record, 0));
      visible.clear();
    }
  }

  try {
    setMotion();
    preference.addEventListener('change', setMotion);
  } catch (error) {
    // Static content is the fallback if enhancement cannot initialize.
    enabled = false;
    document.documentElement.classList.remove('editorial-motion');
  }
})();
